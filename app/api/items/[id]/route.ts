import { NextResponse } from "next/server";
import { ItemUpdateSchema } from "@/lib/validation";
import { archiveItem, FormulaValidationError, KeyCollisionError, UnknownIconError, updateItem } from "@/lib/items";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const parsed = ItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await updateItem(id, parsed.data);
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof FormulaValidationError) {
      return NextResponse.json({ error: error.detail }, { status: 400 });
    }
    if (error instanceof KeyCollisionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof UnknownIconError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await archiveItem(id);
  return NextResponse.json(item);
}
