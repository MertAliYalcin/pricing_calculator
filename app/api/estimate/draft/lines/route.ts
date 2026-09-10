import { NextResponse } from "next/server";
import { addDraftLine, getDraftView } from "@/lib/estimate";
import { EstimateLineCreateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = EstimateLineCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await addDraftLine(parsed.data.itemId, parsed.data.quantity, parsed.data.inputValues);
  return NextResponse.json(await getDraftView(), { status: 201 });
}
