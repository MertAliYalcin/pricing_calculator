import { NextResponse } from "next/server";
import { clearDraft, getDraftView, setDraftTargetBudget } from "@/lib/estimate";
import { EstimateTargetBudgetSchema } from "@/lib/validation";

export async function GET() {
  return NextResponse.json(await getDraftView());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const parsed = EstimateTargetBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await setDraftTargetBudget(parsed.data.targetBudget);
  return NextResponse.json(await getDraftView());
}

export async function DELETE() {
  await clearDraft();
  return NextResponse.json(await getDraftView());
}
