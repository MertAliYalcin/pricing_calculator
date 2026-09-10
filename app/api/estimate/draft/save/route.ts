import { NextResponse } from "next/server";
import { saveDraft } from "@/lib/estimate";
import { EstimateSaveSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = EstimateSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const saved = await saveDraft(parsed.data.name, parsed.data.client ?? null);
  return NextResponse.json(
    {
      ...saved,
      total: saved.total?.toNumber() ?? null,
      targetBudget: saved.targetBudget?.toNumber() ?? null,
    },
    { status: 201 },
  );
}
