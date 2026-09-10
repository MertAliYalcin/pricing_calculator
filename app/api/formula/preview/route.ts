import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateFormula, type ItemInputDef, type ParameterDef } from "@/lib/formula";
import { getResolvedParameters } from "@/lib/parameters";
import { FormulaPreviewSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = FormulaPreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const resolvedParameters = await getResolvedParameters();
  const parameterDefs: ParameterDef[] = resolvedParameters.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    unit: p.unit,
  }));

  let itemInputDefs: ItemInputDef[] = [];
  if (parsed.data.itemId) {
    const inputs = await db.itemInput.findMany({ where: { itemId: parsed.data.itemId } });
    itemInputDefs = inputs.map((i) => ({
      key: i.key,
      label: i.label,
      defaultValue: i.defaultValue.toNumber(),
      unit: i.unit,
    }));
  }

  const result = evaluateFormula({
    expression: parsed.data.expression,
    lineInputs: parsed.data.inputs,
    itemInputs: itemInputDefs,
    parameters: parameterDefs,
    quantity: parsed.data.quantity,
  });

  return NextResponse.json(result);
}
