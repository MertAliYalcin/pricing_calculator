import { db } from "@/lib/db";
import { evaluateFormula, type EvalResult, type ItemInputDef, type ParameterDef, type Trace } from "@/lib/formula";
import { getResolvedParameters } from "@/lib/parameters";
import { roundForPersistence } from "@/lib/money";

/** Exactly one draft estimate exists at a time (SPEC.md §3.5); it is the cart. */
export async function getOrCreateDraft() {
  const existing = await db.estimate.findFirst({ where: { status: "draft" } });
  if (existing) return existing;
  return db.estimate.create({ data: { name: "Draft estimate", status: "draft" } });
}

async function getAllParameters(): Promise<ParameterDef[]> {
  const resolved = await getResolvedParameters();
  return resolved.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    unit: p.unit,
  }));
}

/** Evaluate one line against the item's current formula/inputs and live parameters. */
export async function evaluateLine(
  itemId: string,
  quantity: number,
  inputValues: Record<string, number>,
  parameters: ParameterDef[],
): Promise<{ formula: string; itemName: string; categoryName: string; result: EvalResult } | null> {
  const item = await db.item.findUnique({ where: { id: itemId }, include: { inputs: true, category: true } });
  if (!item) return null;

  const itemInputs: ItemInputDef[] = item.inputs.map((i) => ({
    key: i.key,
    label: i.label,
    defaultValue: i.defaultValue.toNumber(),
    unit: i.unit,
  }));

  const result = evaluateFormula({
    expression: item.formula,
    lineInputs: inputValues,
    itemInputs,
    parameters,
    quantity,
  });

  return { formula: item.formula, itemName: item.name, categoryName: item.category.name, result };
}

export type DraftLineView = {
  id: string;
  itemId: string | null;
  itemName: string;
  categoryName: string;
  formula: string;
  quantity: number;
  inputValues: Record<string, number>;
  sortOrder: number;
} & ({ ok: true; trace: Trace } | { ok: false; message: string });

export type DraftView = {
  id: string;
  targetBudget: number | null;
  lines: DraftLineView[];
  total: number;
  hasErrors: boolean;
};

/** Re-resolves every line in the draft against live parameters (SPEC.md §3.6: draft lines are always recomputed on read). */
export async function getDraftView(): Promise<DraftView> {
  const draft = await getOrCreateDraft();
  const lines = await db.estimateLine.findMany({ where: { estimateId: draft.id }, orderBy: { sortOrder: "asc" } });
  const parameters = await getAllParameters();

  const views: DraftLineView[] = [];
  for (const line of lines) {
    if (!line.itemId) {
      views.push({
        id: line.id,
        itemId: null,
        itemName: line.itemName,
        categoryName: line.categoryName,
        formula: line.formula,
        quantity: line.quantity.toNumber(),
        inputValues: line.inputValues as Record<string, number>,
        sortOrder: line.sortOrder,
        ok: false,
        message: "Referenced item no longer exists.",
      });
      continue;
    }

    const evaluated = await evaluateLine(
      line.itemId,
      line.quantity.toNumber(),
      line.inputValues as Record<string, number>,
      parameters,
    );

    if (!evaluated) {
      views.push({
        id: line.id,
        itemId: line.itemId,
        itemName: line.itemName,
        categoryName: line.categoryName,
        formula: line.formula,
        quantity: line.quantity.toNumber(),
        inputValues: line.inputValues as Record<string, number>,
        sortOrder: line.sortOrder,
        ok: false,
        message: "Referenced item no longer exists.",
      });
      continue;
    }

    const { formula, itemName, categoryName, result } = evaluated;
    if (result.ok) {
      views.push({
        id: line.id,
        itemId: line.itemId,
        itemName,
        categoryName,
        formula,
        quantity: line.quantity.toNumber(),
        inputValues: line.inputValues as Record<string, number>,
        sortOrder: line.sortOrder,
        ok: true,
        trace: result.trace,
      });
    } else {
      views.push({
        id: line.id,
        itemId: line.itemId,
        itemName,
        categoryName,
        formula,
        quantity: line.quantity.toNumber(),
        inputValues: line.inputValues as Record<string, number>,
        sortOrder: line.sortOrder,
        ok: false,
        message: result.message,
      });
    }
  }

  const total = views.reduce((sum, v) => (v.ok ? sum + v.trace.lineTotal : sum), 0);

  return {
    id: draft.id,
    targetBudget: draft.targetBudget?.toNumber() ?? null,
    lines: views,
    total,
    hasErrors: views.some((v) => !v.ok),
  };
}

export async function getDraftTotal(): Promise<number> {
  const view = await getDraftView();
  return view.total;
}

export async function addDraftLine(itemId: string, quantity: number, inputValues: Record<string, number>) {
  const draft = await getOrCreateDraft();
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId }, include: { category: true } });
  const maxSortOrder = await db.estimateLine.aggregate({
    where: { estimateId: draft.id },
    _max: { sortOrder: true },
  });

  return db.estimateLine.create({
    data: {
      estimateId: draft.id,
      itemId,
      itemName: item.name,
      categoryName: item.category.name,
      formula: item.formula,
      quantity,
      inputValues,
      resolvedScope: {},
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateDraftLine(
  lineId: string,
  data: { quantity?: number; inputValues?: Record<string, number> },
) {
  return db.estimateLine.update({
    where: { id: lineId },
    data: {
      ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
      ...(data.inputValues !== undefined ? { inputValues: data.inputValues } : {}),
    },
  });
}

export async function removeDraftLine(lineId: string) {
  await db.estimateLine.delete({ where: { id: lineId } });
}

export async function setDraftTargetBudget(targetBudget: number | null) {
  const draft = await getOrCreateDraft();
  return db.estimate.update({ where: { id: draft.id }, data: { targetBudget } });
}

export async function clearDraft() {
  const draft = await getOrCreateDraft();
  await db.estimateLine.deleteMany({ where: { estimateId: draft.id } });
  return draft;
}

/** Freezes the current draft into a saved snapshot and starts a fresh draft (SPEC.md §3.5, §3.6). */
export async function saveDraft(name: string, client: string | null) {
  const view = await getDraftView();

  return db.$transaction(async (tx) => {
    for (const line of view.lines) {
      await tx.estimateLine.update({
        where: { id: line.id },
        data: line.ok
          ? {
              resolvedScope: line.trace.scope,
              lineTotal: roundForPersistence(line.trace.lineTotal),
              error: null,
            }
          : {
              resolvedScope: {},
              lineTotal: null,
              error: line.message,
            },
      });
    }

    const saved = await tx.estimate.update({
      where: { id: view.id },
      data: {
        name,
        client,
        status: "saved",
        total: roundForPersistence(view.total),
        savedAt: new Date(),
      },
    });

    await tx.estimate.create({ data: { name: "Draft estimate", status: "draft" } });

    return saved;
  });
}

/** Copies a saved estimate's lines into the current draft, re-resolved against today's parameters. */
export async function duplicateIntoDraft(estimateId: string) {
  const source = await db.estimate.findUniqueOrThrow({ where: { id: estimateId }, include: { lines: true } });
  const draft = await getOrCreateDraft();
  const maxSortOrder = await db.estimateLine.aggregate({
    where: { estimateId: draft.id },
    _max: { sortOrder: true },
  });
  let nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

  for (const line of source.lines) {
    await db.estimateLine.create({
      data: {
        estimateId: draft.id,
        itemId: line.itemId,
        itemName: line.itemName,
        categoryName: line.categoryName,
        formula: line.formula,
        quantity: line.quantity,
        inputValues: line.inputValues as object,
        resolvedScope: {},
        sortOrder: nextSortOrder++,
      },
    });
  }

  return draft;
}
