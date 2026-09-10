import { db } from "@/lib/db";
import { resolveParameterGraph } from "@/lib/parameters";
import { ParametersTable } from "@/components/parameters/parameters-table";
import { PageHeader } from "@/components/page-header";

export default async function ParametersPage() {
  const parameters = await db.parameter.findMany({
    where: { archivedAt: null },
    orderBy: [{ group: "asc" }, { label: "asc" }],
  });

  const items = await db.item.findMany({ where: { archivedAt: null }, select: { id: true, name: true, formula: true } });

  const resolved = resolveParameterGraph(
    parameters.map((p) => ({
      key: p.key,
      label: p.label,
      value: p.value.toNumber(),
      unit: p.unit,
      formula: p.formula,
      editable: p.editable,
    })),
  );
  const resolvedByKey = new Map(resolved.map((r) => [r.key, r]));

  const rows = parameters.map((p) => {
    const pattern = new RegExp(`\\b${p.key}\\b`);
    const r = resolvedByKey.get(p.key)!;
    return {
      id: p.id,
      key: p.key,
      label: p.label,
      value: r.value,
      formula: p.formula,
      editable: p.editable,
      error: r.error,
      unit: p.unit,
      group: p.group,
      description: p.description,
      usedByCount: items.filter((item) => pattern.test(item.formula)).length,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <PageHeader
        eyebrow="Rate schedule"
        title="Parameters"
        note="Named values that formulas draw on. Change one and the working draft re-prices; saved estimates keep the numbers they were saved with. A parameter's own value can be a formula over other parameters, or editable directly from the catalog screen."
      />
      <ParametersTable initialParameters={rows} existingKeys={parameters.map((p) => p.key)} />
    </div>
  );
}
