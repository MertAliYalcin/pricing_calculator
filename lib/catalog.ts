import { db } from "@/lib/db";
import { evaluateFormula, extractIdentifiers, type EvalResult, type ParameterDef } from "@/lib/formula";
import { getResolvedParameters } from "@/lib/parameters";
import { resolveIcon, type ResolvedIcon } from "@/lib/icons";

export type EditableCatalogParameter = {
  id: string;
  key: string;
  label: string;
  value: number;
  unit: string | null;
};

export type CatalogItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  formula: string;
  icon: ResolvedIcon | null;
  unitLabel: string | null;
  notes: string | null;
  inputs: { key: string; label: string; defaultValue: number; unit: string | null; sortOrder: number }[];
  editableParameters: EditableCatalogParameter[];
  preview: EvalResult;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  itemCount: number;
};

export async function getCategories(): Promise<CatalogCategory[]> {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: { where: { archivedAt: null } } } } },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    sortOrder: c.sortOrder,
    itemCount: c._count.items,
  }));
}

/** Catalog items priced with input defaults and qty = 1, per SPEC.md §4.1. */
export async function getCatalogItems(): Promise<CatalogItem[]> {
  const [items, resolvedParameters] = await Promise.all([
    db.item.findMany({
      where: { archivedAt: null },
      include: { inputs: { orderBy: { sortOrder: "asc" } }, category: true },
      orderBy: { name: "asc" },
    }),
    getResolvedParameters(),
  ]);

  const parameterDefs: ParameterDef[] = resolvedParameters.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    unit: p.unit,
  }));

  const editableParamsByKey = new Map(
    resolvedParameters.filter((p) => p.editable && p.id).map((p) => [p.key, p]),
  );

  return items.map((item) => {
    const inputs = item.inputs.map((i) => ({
      key: i.key,
      label: i.label,
      defaultValue: i.defaultValue.toNumber(),
      unit: i.unit,
      sortOrder: i.sortOrder,
    }));

    const preview = evaluateFormula({
      expression: item.formula,
      lineInputs: {},
      itemInputs: inputs,
      parameters: parameterDefs,
      quantity: 1,
    });

    const inputKeys = new Set(inputs.map((i) => i.key));
    const editableParameters: EditableCatalogParameter[] = extractIdentifiers(item.formula)
      .filter((id) => !inputKeys.has(id) && editableParamsByKey.has(id))
      .map((id) => {
        const p = editableParamsByKey.get(id)!;
        return { id: p.id!, key: p.key, label: p.label, value: p.value, unit: p.unit };
      });

    return {
      id: item.id,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      name: item.name,
      description: item.description,
      formula: item.formula,
      icon: resolveIcon(item.icon),
      unitLabel: item.unitLabel,
      notes: item.notes,
      inputs,
      editableParameters,
      preview,
    };
  });
}
