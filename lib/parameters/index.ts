import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { validateFormula } from "@/lib/formula";
import { roundForPersistence } from "@/lib/money";
import { resolveParameterGraph, type RawParameter, type ResolvedParameter } from "./graph";

function identifierPattern(key: string): RegExp {
  return new RegExp(`\\b${key}\\b`, "g");
}

/** Items whose formula references the given identifier. */
export async function findItemsUsingIdentifier(key: string) {
  const pattern = identifierPattern(key);
  const items = await db.item.findMany({ where: { archivedAt: null } });
  return items.filter((item) => pattern.test(item.formula));
}

/** Other parameters whose formula references the given identifier. */
export async function findParametersUsingIdentifier(key: string, excludeParameterId?: string) {
  const pattern = identifierPattern(key);
  const parameters = await db.parameter.findMany({ where: { archivedAt: null, formula: { not: null } } });
  return parameters.filter((p) => p.id !== excludeParameterId && p.formula && pattern.test(p.formula));
}

// Re-exported so server code can keep treating `@/lib/parameters` as the one entry point.
// Client components must import from `./graph` directly — this module reaches for Prisma.
export { resolveParameterGraph } from "./graph";
export type { RawParameter, ResolvedParameter } from "./graph";

/**
 * Rewrites the cached `value` of every formula parameter whose number has moved.
 *
 * A formula parameter's `value` column is a denormalisation: reads go through
 * `getResolvedParameters`, which recomputes, so display is correct either way. But leaving a
 * stale number sitting in the column is a trap for the next reader (and for anything that reads
 * the table directly), so callers that change a literal parameter reconcile the derived ones.
 * `PATCH /api/parameters/[id]` does this one-at-a-time via `computeParameterFormulaValue`; this
 * is the whole-graph version, for a caller that changes several literals at once.
 *
 * Returns only what actually changed, so the caller can report it.
 */
export async function syncFormulaParameterValues(
  tx: Prisma.TransactionClient = db,
): Promise<{ key: string; before: number; after: number }[]> {
  const rows = await tx.parameter.findMany({ where: { archivedAt: null } });
  const resolved = resolveParameterGraph(
    rows.map((p) => ({
      id: p.id,
      key: p.key,
      label: p.label,
      value: p.value.toNumber(),
      unit: p.unit,
      formula: p.formula,
      editable: p.editable,
    })),
  );
  const resolvedByKey = new Map(resolved.map((r) => [r.key, r]));

  const changed: { key: string; before: number; after: number }[] = [];
  for (const row of rows) {
    if (row.formula == null) continue;

    const next = resolvedByKey.get(row.key);
    // An unresolvable parameter keeps its last good cached number rather than having NaN written
    // over it — the error is surfaced by `getResolvedParameters`, not buried in the column.
    if (!next || next.error || !Number.isFinite(next.value)) continue;

    const before = row.value.toNumber();
    const after = roundForPersistence(next.value);
    if (before === after) continue;

    await tx.parameter.update({ where: { id: row.id }, data: { value: after } });
    changed.push({ key: row.key, before, after });
  }

  return changed;
}

/** Loads every active parameter with formula-parameter dependencies resolved against each other. */
export async function getResolvedParameters(): Promise<ResolvedParameter[]> {
  const rows = await db.parameter.findMany({ where: { archivedAt: null } });
  return resolveParameterGraph(
    rows.map((p) => ({
      id: p.id,
      key: p.key,
      label: p.label,
      value: p.value.toNumber(),
      unit: p.unit,
      formula: p.formula,
      editable: p.editable,
    })),
  );
}

/**
 * Validates a candidate formula for `key` (new or existing — pass
 * `excludeParameterId` when editing so the row under edit doesn't shadow
 * itself) against every other active parameter, returning the computed
 * value on success or a save-time error on failure (unknown identifier,
 * bad syntax, or a cycle introduced by this very change).
 */
export async function computeParameterFormulaValue(
  key: string,
  formula: string,
  excludeParameterId?: string,
): Promise<{ ok: true; value: number } | { ok: false; message: string }> {
  const syntax = validateFormula(formula);
  if (!syntax.ok) return { ok: false, message: syntax.message };

  const rows = await db.parameter.findMany({ where: { archivedAt: null } });
  const raw: RawParameter[] = rows
    .filter((p) => p.id !== excludeParameterId)
    .map((p) => ({ key: p.key, label: p.label, value: p.value.toNumber(), unit: p.unit, formula: p.formula }));

  const idx = raw.findIndex((p) => p.key === key);
  const candidate: RawParameter = { key, label: key, value: 0, unit: null, formula };
  if (idx >= 0) raw[idx] = candidate;
  else raw.push(candidate);

  const result = resolveParameterGraph(raw).find((r) => r.key === key)!;
  if (result.error) return { ok: false, message: result.error };
  return { ok: true, value: result.value };
}

export class ParameterKeyConflictError extends Error {
  constructor(public readonly key: string, public readonly conflictType: "parameter" | "item_input") {
    super(`Key "${key}" is already used by ${conflictType === "parameter" ? "a parameter" : "an item input"}.`);
  }
}

/** Reject a key that collides with an existing parameter or item input (SPEC.md §5.3). */
export async function assertKeyAvailable(key: string, opts: { excludeParameterId?: string } = {}) {
  const existingParameter = await db.parameter.findUnique({ where: { key } });
  if (existingParameter && existingParameter.id !== opts.excludeParameterId) {
    throw new ParameterKeyConflictError(key, "parameter");
  }

  const existingInput = await db.itemInput.findFirst({ where: { key } });
  if (existingInput) {
    throw new ParameterKeyConflictError(key, "item_input");
  }
}

/**
 * Rename a parameter's key, rewriting the identifier in every item formula
 * and every other parameter's formula that references it, inside one
 * transaction. Returns the number of items and parameters touched.
 */
export async function renameParameterKey(
  parameterId: string,
  newKey: string,
): Promise<{ itemsTouched: number; parametersTouched: number }> {
  return db.$transaction(async (tx) => {
    const parameter = await tx.parameter.findUniqueOrThrow({ where: { id: parameterId } });
    if (parameter.key === newKey) return { itemsTouched: 0, parametersTouched: 0 };

    const conflict = await tx.parameter.findUnique({ where: { key: newKey } });
    if (conflict) throw new ParameterKeyConflictError(newKey, "parameter");
    const conflictInput = await tx.itemInput.findFirst({ where: { key: newKey } });
    if (conflictInput) throw new ParameterKeyConflictError(newKey, "item_input");

    const pattern = identifierPattern(parameter.key);
    const items = await tx.item.findMany({ where: { archivedAt: null } });
    const affectedItems = items.filter((item) => pattern.test(item.formula));

    for (const item of affectedItems) {
      await tx.formulaRevision.create({ data: { itemId: item.id, formula: item.formula } });
      await tx.item.update({
        where: { id: item.id },
        data: { formula: item.formula.replace(pattern, newKey) },
      });
    }

    const otherParameters = await tx.parameter.findMany({
      where: { archivedAt: null, id: { not: parameterId }, formula: { not: null } },
    });
    const affectedParameters = otherParameters.filter((p) => p.formula && pattern.test(p.formula));

    for (const p of affectedParameters) {
      await tx.parameter.update({ where: { id: p.id }, data: { formula: p.formula!.replace(pattern, newKey) } });
    }

    await tx.parameter.update({ where: { id: parameterId }, data: { key: newKey } });

    return { itemsTouched: affectedItems.length, parametersTouched: affectedParameters.length };
  });
}

export class ParameterInUseError extends Error {
  constructor(
    public readonly blockingItems: { id: string; name: string }[],
    public readonly blockingParameters: { id: string; key: string; label: string }[] = [],
  ) {
    super("Parameter is referenced by one or more item or parameter formulas.");
  }
}

/** Delete (archive) a parameter, refusing if any active item or parameter formula still references it. */
export async function deleteParameter(parameterId: string) {
  const parameter = await db.parameter.findUniqueOrThrow({ where: { id: parameterId } });
  const blockingItems = await findItemsUsingIdentifier(parameter.key);
  const blockingParameters = await findParametersUsingIdentifier(parameter.key, parameterId);
  if (blockingItems.length > 0 || blockingParameters.length > 0) {
    throw new ParameterInUseError(
      blockingItems.map((item) => ({ id: item.id, name: item.name })),
      blockingParameters.map((p) => ({ id: p.id, key: p.key, label: p.label })),
    );
  }
  await db.parameter.update({ where: { id: parameterId }, data: { archivedAt: new Date() } });
}

export type ParameterUpdateData = Prisma.ParameterUpdateInput;
