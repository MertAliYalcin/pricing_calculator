import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ParameterUpdateSchema } from "@/lib/validation";
import {
  computeParameterFormulaValue,
  deleteParameter,
  ParameterInUseError,
  ParameterKeyConflictError,
  renameParameterKey,
} from "@/lib/parameters";
import { getDraftTotal } from "@/lib/estimate";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const parsed = ParameterUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = await getDraftTotal();

  try {
    const current = await db.parameter.findUniqueOrThrow({ where: { id } });

    const finalFormula = parsed.data.formula !== undefined ? parsed.data.formula : current.formula;
    const finalEditable = parsed.data.editable !== undefined ? parsed.data.editable : current.editable;
    if (finalEditable && finalFormula != null) {
      return NextResponse.json({ error: "A formula parameter cannot also be catalog-editable." }, { status: 400 });
    }

    if (parsed.data.key !== undefined) {
      await renameParameterKey(id, parsed.data.key);
    }

    const rest = { ...parsed.data };
    delete rest.key;

    if (rest.formula !== undefined) {
      if (rest.formula === null) {
        // Switching back to a literal value: keep the current cached number unless a new one was given.
        if (rest.value === undefined) rest.value = current.value.toNumber();
      } else {
        const effectiveKey = parsed.data.key ?? current.key;
        const computed = await computeParameterFormulaValue(effectiveKey, rest.formula, id);
        if (!computed.ok) {
          return NextResponse.json({ error: computed.message }, { status: 400 });
        }
        rest.value = computed.value;
      }
    }

    if (Object.keys(rest).length > 0) {
      await db.parameter.update({ where: { id }, data: rest });
    }
  } catch (error) {
    if (error instanceof ParameterKeyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const parameter = await db.parameter.findUniqueOrThrow({ where: { id } });
  const after = await getDraftTotal();

  return NextResponse.json({
    ...parameter,
    value: parameter.value.toNumber(),
    draftDelta: before !== after ? { before, after } : null,
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteParameter(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ParameterInUseError) {
      return NextResponse.json(
        { error: error.message, blockingItems: error.blockingItems, blockingParameters: error.blockingParameters },
        { status: 409 },
      );
    }
    throw error;
  }
}
