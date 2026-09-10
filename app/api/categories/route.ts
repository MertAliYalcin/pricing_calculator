import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CategorySchema } from "@/lib/validation";

export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: { where: { archivedAt: null } } } } },
  });

  return NextResponse.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      sortOrder: c.sortOrder,
      itemCount: c._count.items,
    })),
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.category.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return NextResponse.json({ error: `Slug "${parsed.data.slug}" is already in use.` }, { status: 409 });
  }

  const category = await db.category.create({ data: parsed.data });
  return NextResponse.json(category, { status: 201 });
}
