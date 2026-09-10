import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ItemSchema } from "@/lib/validation";
import { createItem, FormulaValidationError, KeyCollisionError, UnknownIconError } from "@/lib/items";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");

  const items = await db.item.findMany({
    where: {
      archivedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { notes: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { inputs: { orderBy: { sortOrder: "asc" } }, category: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    items.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      name: item.name,
      description: item.description,
      formula: item.formula,
      icon: item.icon,
      unitLabel: item.unitLabel,
      notes: item.notes,
      inputs: item.inputs.map((i) => ({
        id: i.id,
        key: i.key,
        label: i.label,
        defaultValue: i.defaultValue.toNumber(),
        unit: i.unit,
        sortOrder: i.sortOrder,
      })),
    })),
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await createItem(parsed.data);
    return NextResponse.json(item, { status: 201 });
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
