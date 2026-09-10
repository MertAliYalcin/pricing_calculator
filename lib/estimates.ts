import { db } from "@/lib/db";
import type { ItemInputDef, ScopeEntry as FormulaScopeEntry } from "@/lib/formula";
import { getResolvedParameters } from "@/lib/parameters";
import type { RawParameter } from "@/lib/parameters/graph";
import { repriceLines, type RepriceLine } from "@/lib/reprice";
import { roundForPersistence } from "@/lib/money";
import type { Prisma } from "@prisma/client";

export async function getSavedEstimates() {
  const estimates = await db.estimate.findMany({
    where: { status: "saved" },
    orderBy: { savedAt: "desc" },
  });

  return estimates.map((e) => ({
    id: e.id,
    name: e.name,
    client: e.client,
    savedAt: e.savedAt,
    total: e.total?.toNumber() ?? null,
    targetBudget: e.targetBudget?.toNumber() ?? null,
  }));
}

type ScopeEntry = FormulaScopeEntry;

export async function getEstimateSnapshot(id: string) {
  const estimate = await db.estimate.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) return null;

  const referencedKeys = new Set<string>();
  for (const line of estimate.lines) {
    const scope = line.resolvedScope as Record<string, ScopeEntry> | null;
    if (!scope) continue;
    for (const [key, entry] of Object.entries(scope)) {
      if (entry.source === "parameter") referencedKeys.add(key);
    }
  }
  const currentParameters = await getResolvedParameters();
  const currentByKey = new Map(
    currentParameters.filter((p) => referencedKeys.has(p.key) && !p.error).map((p) => [p.key, p.value]),
  );

  return {
    id: estimate.id,
    name: estimate.name,
    client: estimate.client,
    status: estimate.status,
    notes: estimate.notes,
    targetBudget: estimate.targetBudget?.toNumber() ?? null,
    total: estimate.total?.toNumber() ?? null,
    savedAt: estimate.savedAt,
    lines: estimate.lines.map((line) => {
      const scope = line.resolvedScope as Record<string, ScopeEntry>;
      const scopeWithDrift = Object.fromEntries(
        Object.entries(scope).map(([key, entry]) => [
          key,
          {
            ...entry,
            currentValue: entry.source === "parameter" ? (currentByKey.get(key) ?? null) : null,
            changedSinceSave:
              entry.source === "parameter" && currentByKey.has(key) && currentByKey.get(key) !== entry.value,
          },
        ]),
      );

      return {
        id: line.id,
        itemId: line.itemId,
        itemName: line.itemName,
        categoryName: line.categoryName,
        formula: line.formula,
        quantity: line.quantity.toNumber(),
        inputValues: line.inputValues as Record<string, number>,
        resolvedScope: scopeWithDrift,
        lineTotal: line.lineTotal?.toNumber() ?? null,
        error: line.error,
      };
    }),
  };
}

export type EstimateSnapshot = NonNullable<Awaited<ReturnType<typeof getEstimateSnapshot>>>;

export class EstimateNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Saved estimate "${id}" was not found.`);
  }
}

/**
 * Edits an estimate's metadata only — name, client, notes, target budget.
 * The frozen numbers (formulas, resolved scope, line/estimate totals) are
 * never touched here: that would break the snapshot guarantee (CLAUDE.md
 * "The formula engine is the load-bearing part", rule 4). To reprice,
 * duplicate the estimate into the draft and save it again.
 */
export async function updateEstimateDetails(
  id: string,
  data: { name?: string; client?: string | null; notes?: string | null; targetBudget?: number | null },
) {
  const result = await db.estimate.updateMany({ where: { id, status: "saved" }, data });
  if (result.count === 0) throw new EstimateNotFoundError(id);
  return getEstimateSnapshot(id);
}

/**
 * Every active parameter in the shape `repriceLines` and `resolveParameterGraph` want.
 * Takes a transaction client so a caller mid-transaction reads its own writes.
 */
export async function getRawParameters(tx: Prisma.TransactionClient = db): Promise<RawParameter[]> {
  const rows = await tx.parameter.findMany({
    where: { archivedAt: null },
    orderBy: [{ group: "asc" }, { label: "asc" }],
  });

  return rows.map((p) => ({
    id: p.id,
    key: p.key,
    label: p.label,
    value: p.value.toNumber(),
    unit: p.unit,
    formula: p.formula,
    editable: p.editable,
  }));
}

/**
 * The inputs a client needs to ask "what would this estimate's line-up cost under different
 * assumptions?".
 *
 * This is **not** a repricing of the estimate. The snapshot's own frozen numbers are untouched
 * and stay authoritative (CLAUDE.md rule 4) — `baselineTotal` is read straight off the frozen
 * column. What comes back is the *line-up* (formulas, quantities, inputs) plus today's
 * parameters, so `repriceLines` can produce a projection alongside the real thing.
 */
export async function getEstimateRepriceInput(id: string) {
  const estimate = await db.estimate.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) return null;

  // `EstimateLine.itemId` is a loose reference, not a Prisma relation (a line survives its item
  // being archived), so the inputs are fetched separately and grouped by item.
  const itemIds = [...new Set(estimate.lines.map((l) => l.itemId).filter((id): id is string => id != null))];
  const inputRows = itemIds.length
    ? await db.itemInput.findMany({ where: { itemId: { in: itemIds } }, orderBy: { sortOrder: "asc" } })
    : [];

  const inputsByItem = new Map<string, ItemInputDef[]>();
  for (const inp of inputRows) {
    const list = inputsByItem.get(inp.itemId) ?? [];
    list.push({ key: inp.key, label: inp.label, defaultValue: inp.defaultValue.toNumber(), unit: inp.unit });
    inputsByItem.set(inp.itemId, list);
  }

  const lines: RepriceLine[] = estimate.lines.map((line) => ({
    id: line.id,
    itemId: line.itemId,
    itemName: line.itemName,
    categoryName: line.categoryName,
    formula: line.formula,
    quantity: line.quantity.toNumber(),
    inputValues: (line.inputValues ?? {}) as Record<string, number>,
    // From the live item, not the snapshot: an `item_default` identifier has to resolve against
    // the input that exists now, and a line whose item is gone simply has none.
    itemInputs: (line.itemId && inputsByItem.get(line.itemId)) || [],
  }));

  return {
    estimateId: estimate.id,
    estimateName: estimate.name,
    baselineTotal: estimate.total?.toNumber() ?? null,
    savedAt: estimate.savedAt,
    lines,
    parameters: await getRawParameters(),
  };
}

export type EstimateRepriceInput = NonNullable<Awaited<ReturnType<typeof getEstimateRepriceInput>>>;

/**
 * Freezes a repriced line-up into a new saved estimate.
 *
 * Creating rather than updating is the point: a saved estimate is a snapshot, so re-running the
 * numbers produces a *new* one and leaves the original standing (CLAUDE.md rule 4). Both the
 * seed and "Apply to Normo" go through here, so the two can never diverge on what a snapshot
 * consists of.
 *
 * Accepts a transaction client so a caller can write the parameters and the snapshot atomically.
 */
export async function createSnapshotFromLines(
  {
    name,
    lines,
    parameters,
    notes,
    client,
    targetBudget,
  }: {
    name: string;
    lines: RepriceLine[];
    parameters: RawParameter[];
    notes?: string | null;
    client?: string | null;
    targetBudget?: number | null;
  },
  tx: Prisma.TransactionClient = db,
) {
  const result = repriceLines({ lines, parameters });

  // The frozen scope and totals are copied in, so the estimate never has to be joined back to the
  // live parameters table to display a number.
  const created = await tx.estimate.create({
    data: {
      name,
      status: "saved",
      notes: notes ?? null,
      client: client ?? null,
      targetBudget: targetBudget ?? null,
      total: roundForPersistence(result.total),
      savedAt: new Date(),
      lines: {
        create: result.lines.map((line, sortOrder) => ({
          itemId: line.itemId ?? null,
          itemName: line.itemName,
          categoryName: line.categoryName,
          formula: line.formula,
          quantity: line.quantity,
          inputValues: line.inputValues,
          resolvedScope: line.ok ? line.trace.scope : {},
          lineTotal: line.ok ? roundForPersistence(line.trace.lineTotal) : null,
          error: line.ok ? null : line.message,
          sortOrder,
        })),
      },
    },
  });

  return { id: created.id, total: result.total, hasErrors: result.hasErrors, parameterErrors: result.parameterErrors };
}

/** Deletes a saved estimate outright. Unlike parameters/items, nothing else references an estimate, so there's no historical trace to preserve — a hard delete (cascading to its lines) is safe. */
export async function deleteEstimate(id: string) {
  const result = await db.estimate.deleteMany({ where: { id, status: "saved" } });
  if (result.count === 0) throw new EstimateNotFoundError(id);
}
