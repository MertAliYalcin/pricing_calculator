import { NextResponse } from "next/server";
import { EstimateNotFoundError, deleteEstimate, getEstimateSnapshot, updateEstimateDetails } from "@/lib/estimates";
import { EstimateUpdateSchema } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await getEstimateSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const parsed = EstimateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json(await updateEstimateDetails(id, parsed.data));
  } catch (error) {
    if (error instanceof EstimateNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteEstimate(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
