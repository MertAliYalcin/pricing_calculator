import { NextResponse } from "next/server";
import { getDraftView, removeDraftLine, updateDraftLine } from "@/lib/estimate";
import { EstimateLineUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const parsed = EstimateLineUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await updateDraftLine(id, parsed.data);
  return NextResponse.json(await getDraftView());
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await removeDraftLine(id);
  return NextResponse.json(await getDraftView());
}
