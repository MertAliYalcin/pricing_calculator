import { NextResponse } from "next/server";
import { duplicateIntoDraft } from "@/lib/estimate";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await duplicateIntoDraft(id);
  return NextResponse.json({ ok: true });
}
