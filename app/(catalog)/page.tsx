import { db } from "@/lib/db";
import { getCategories, getCatalogItems } from "@/lib/catalog";
import { getResolvedParameters } from "@/lib/parameters";
import { getDraftView } from "@/lib/estimate";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { PageHeader } from "@/components/page-header";

export default async function CatalogPage() {
  const [categories, items, resolvedParameters, parameterGroups, draft] = await Promise.all([
    getCategories(),
    getCatalogItems(),
    getResolvedParameters(),
    db.parameter.findMany({ where: { archivedAt: null }, select: { key: true, group: true } }),
    getDraftView(),
  ]);

  const groupByKey = new Map(parameterGroups.map((p) => [p.key, p.group]));
  const parameters = resolvedParameters.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    unit: p.unit,
    group: groupByKey.get(p.key) ?? null,
    error: p.error,
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PageHeader
        eyebrow="Catalog"
        title="Priced items"
        note="Every price is a formula. Click a price to see what it is made of."
      />
      <CatalogBrowser categories={categories} items={items} parameters={parameters} draft={draft} />
    </div>
  );
}
