import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ParameterSchema } from "@/lib/validation";
import { assertKeyAvailable, computeParameterFormulaValue, ParameterKeyConflictError } from "@/lib/parameters";

export async function GET() {
  const parameters = await db.parameter.findMany({
    where: { archivedAt: null },
    orderBy: [{ group: "asc" }, { label: "asc" }],
  });

  const usageCounts = await Promise.all(
    parameters.map(async (p) => {
      const items = await db.item.findMany({ where: { archivedAt: null }, select: { formula: true } });
      const pattern = new RegExp(`\\b${p.key}\\b`);
      return items.filter((item) => pattern.test(item.formula)).length;
    }),
  );

  return NextResponse.json(
    parameters.map((p, i) => ({ ...p, value: p.value.toNumber(), usedByCount: usageCounts[i] })),
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ParameterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assertKeyAvailable(parsed.data.key);
  } catch (error) {
    if (error instanceof ParameterKeyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  let value = parsed.data.value ?? 0;
  if (parsed.data.formula) {
    const computed = await computeParameterFormulaValue(parsed.data.key, parsed.data.formula);
    if (!computed.ok) {
      return NextResponse.json({ error: computed.message }, { status: 400 });
    }
    value = computed.value;
  }

  const parameter = await db.parameter.create({
    data: { ...parsed.data, value, formula: parsed.data.formula ?? null },
  });
  return NextResponse.json({ ...parameter, value: parameter.value.toNumber() }, { status: 201 });
}
