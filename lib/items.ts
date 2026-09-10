import { db } from "@/lib/db";
import { checkKeyCollision, validateFormula } from "@/lib/formula";
import { iconExists } from "@/lib/icons";

export class FormulaValidationError extends Error {
  constructor(public readonly detail: { kind: string; message: string; token?: string }) {
    super(detail.message);
  }
}

export class KeyCollisionError extends Error {
  constructor(public readonly key: string) {
    super(`Key "${key}" collides with an existing parameter or item input key.`);
  }
}

export class UnknownIconError extends Error {
  constructor(public readonly slug: string) {
    super(`"${slug}" is not a known icon slug.`);
  }
}

type ItemInputPayload = { key: string; label: string; defaultValue: number; unit?: string | null; sortOrder?: number };

type CreateItemPayload = {
  categoryId: string;
  name: string;
  description?: string | null;
  formula: string;
  icon?: string | null;
  unitLabel?: string | null;
  notes?: string | null;
  inputs: ItemInputPayload[];
};

function assertIconValid(icon: string | null | undefined) {
  if (icon != null && !iconExists(icon)) {
    throw new UnknownIconError(icon);
  }
}

async function assertFormulaAndInputsValid(formula: string, inputs: ItemInputPayload[]) {
  const syntax = validateFormula(formula);
  if (!syntax.ok) {
    throw new FormulaValidationError(syntax);
  }

  const parameterKeys = (await db.parameter.findMany({ where: { archivedAt: null }, select: { key: true } })).map(
    (p) => p.key,
  );
  const inputKeys = inputs.map((i) => i.key);

  for (const input of inputs) {
    const collision = checkKeyCollision(
      input.key,
      inputKeys.filter((k) => k !== input.key),
      parameterKeys,
    );
    if (!collision.ok) throw new KeyCollisionError(input.key);
  }

  const unresolvable = syntax.identifiers.filter((id) => !parameterKeys.includes(id) && !inputKeys.includes(id));
  if (unresolvable.length > 0) {
    throw new FormulaValidationError({
      kind: "unknown_identifier",
      message: `Unknown identifier "${unresolvable[0]}" — it is not a parameter or an item input.`,
      token: unresolvable[0],
    });
  }
}

export async function createItem(payload: CreateItemPayload) {
  await assertFormulaAndInputsValid(payload.formula, payload.inputs);
  assertIconValid(payload.icon);

  return db.item.create({
    data: {
      categoryId: payload.categoryId,
      name: payload.name,
      description: payload.description ?? null,
      formula: payload.formula,
      icon: payload.icon ?? null,
      unitLabel: payload.unitLabel ?? null,
      notes: payload.notes ?? null,
      inputs: {
        create: payload.inputs.map((input, i) => ({
          key: input.key,
          label: input.label,
          defaultValue: input.defaultValue,
          unit: input.unit ?? null,
          sortOrder: input.sortOrder ?? i,
        })),
      },
    },
    include: { inputs: true },
  });
}

export type UpdateItemPayload = Partial<Omit<CreateItemPayload, "inputs">> & { inputs?: ItemInputPayload[] };

export async function updateItem(itemId: string, payload: UpdateItemPayload) {
  const existing = await db.item.findUniqueOrThrow({ where: { id: itemId }, include: { inputs: true } });

  const formula = payload.formula ?? existing.formula;
  const inputs =
    payload.inputs ??
    existing.inputs.map((i) => ({
      key: i.key,
      label: i.label,
      defaultValue: i.defaultValue.toNumber(),
      unit: i.unit,
      sortOrder: i.sortOrder,
    }));

  if (payload.formula !== undefined || payload.inputs !== undefined) {
    await assertFormulaAndInputsValid(formula, inputs);
  }
  if (payload.icon !== undefined) {
    assertIconValid(payload.icon);
  }

  return db.$transaction(async (tx) => {
    if (payload.formula !== undefined && payload.formula !== existing.formula) {
      await tx.formulaRevision.create({ data: { itemId, formula: existing.formula } });
    }

    if (payload.inputs !== undefined) {
      await tx.itemInput.deleteMany({ where: { itemId } });
      await tx.itemInput.createMany({
        data: payload.inputs.map((input, i) => ({
          itemId,
          key: input.key,
          label: input.label,
          defaultValue: input.defaultValue,
          unit: input.unit ?? null,
          sortOrder: input.sortOrder ?? i,
        })),
      });
    }

    return tx.item.update({
      where: { id: itemId },
      data: {
        ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.formula !== undefined ? { formula: payload.formula } : {}),
        ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
        ...(payload.unitLabel !== undefined ? { unitLabel: payload.unitLabel } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      },
      include: { inputs: true },
    });
  });
}

export async function archiveItem(itemId: string) {
  return db.item.update({ where: { id: itemId }, data: { archivedAt: new Date() } });
}
