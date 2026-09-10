import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const revisions = await db.formulaRevision.findMany({
    where: { itemId: id },
    orderBy: { replacedAt: "desc" },
  });
  return NextResponse.json(revisions);
}
