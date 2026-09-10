import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateFormula } from "@/lib/formula";
import { FormulaValidateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = FormulaValidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = validateFormula(parsed.data.expression);
  if (!result.ok) {
    return NextResponse.json(result);
  }

  const parameters = await db.parameter.findMany({ where: { archivedAt: null }, select: { key: true } });
  const parameterKeys = new Set(parameters.map((p) => p.key));

  let itemInputKeys = new Set<string>();
  if (parsed.data.itemId) {
    const inputs = await db.itemInput.findMany({ where: { itemId: parsed.data.itemId }, select: { key: true } });
    itemInputKeys = new Set(inputs.map((i) => i.key));
  }

  const unresolvable = result.identifiers.filter((id) => !parameterKeys.has(id) && !itemInputKeys.has(id));

  if (unresolvable.length > 0) {
    return NextResponse.json({
      ok: false,
      kind: "unknown_identifier",
      message: `Unknown identifier "${unresolvable[0]}". It is not a parameter or an item input.`,
      token: unresolvable[0],
    });
  }

  return NextResponse.json(result);
}
