import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEstimateSnapshot } from "@/lib/estimates";
import { formatMoney, formatPercent } from "@/lib/money";
import { PriceTag } from "@/components/formula/price-tag";
import { DuplicateIntoDraftButton } from "@/components/estimates/duplicate-into-draft-button";
import { EstimateActions } from "@/components/estimates/estimate-actions";
import { ExportPdfButton } from "@/components/estimates/export-pdf-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const estimate = await getEstimateSnapshot(id);
  // Browsers default a print/"Save as PDF" filename to the document title.
  return { title: estimate ? `${estimate.name} — Pricing Calculator` : "Estimate — Pricing Calculator" };
}

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estimate = await getEstimateSnapshot(id);
  if (!estimate) notFound();

  const diff =
    estimate.total != null && estimate.targetBudget != null ? estimate.total - estimate.targetBudget : null;
  const diffPct = diff != null && estimate.targetBudget ? (diff / estimate.targetBudget) * 100 : null;

  const grouped = new Map<string, typeof estimate.lines>();
  for (const line of estimate.lines) {
    grouped.set(line.categoryName, [...(grouped.get(line.categoryName) ?? []), line]);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/estimates" className="eyebrow transition-colors hover:text-stamp print:hidden">
        ← Saved estimates
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-ink/15 pb-4">
        <div>
          <div className="eyebrow">Snapshot</div>
          <h1 className="mt-1 text-3xl leading-none">{estimate.name}</h1>
          <p className="annot mt-2 text-sm">
            {estimate.client ?? "No client"}
            {estimate.savedAt && ` · saved ${new Date(estimate.savedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <EstimateActions
            estimate={{
              id: estimate.id,
              name: estimate.name,
              client: estimate.client,
              notes: estimate.notes,
              targetBudget: estimate.targetBudget,
            }}
          />
          <DuplicateIntoDraftButton estimateId={estimate.id} />
          <ExportPdfButton />
        </div>
      </header>

      <div className="mt-8 space-y-10">
        {[...grouped.entries()].map(([categoryName, lines]) => (
          <section key={categoryName}>
            <h2 className="mb-1 border-b border-rule pb-1.5 text-lg leading-none">{categoryName}</h2>

            {lines.map((line) => {
              const changed = Object.values(line.resolvedScope).some((entry) => entry.changedSinceSave);
              return (
                <div key={line.id} className="border-b border-rule/60 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-serif text-base leading-tight">{line.itemName}</div>
                      <code className="figure mt-0.5 block break-all text-xs text-graphite">{line.formula}</code>
                      <div className="eyebrow mt-1">Qty {line.quantity}</div>
                    </div>
                    {line.lineTotal != null ? (
                      <PriceTag
                        ok
                        expression={line.formula}
                        scope={line.resolvedScope}
                        unitPrice={line.lineTotal / (line.quantity || 1)}
                        quantity={line.quantity}
                        lineTotal={line.lineTotal}
                      />
                    ) : (
                      <PriceTag ok={false} message={line.error ?? "This line could not be evaluated."} />
                    )}
                  </div>
                  {changed && (
                    <p className="annot mt-2 text-xs text-pencil">
                      A parameter behind this line has changed since the estimate was saved. The figures above are
                      the saved ones.
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="mt-10 ml-auto max-w-xs">
        {estimate.targetBudget != null && (
          <div className="flex items-baseline justify-between border-b border-rule py-1.5">
            <span className="eyebrow">Target budget</span>
            <span className="figure text-sm text-graphite">{formatMoney(estimate.targetBudget)}</span>
          </div>
        )}
        {diff != null && (
          <div className="flex items-baseline justify-between border-b border-rule py-1.5">
            <span className="eyebrow">Variance</span>
            <span className={`figure text-sm ${diff > 0 ? "text-flag" : "text-stamp"}`}>
              {formatMoney(diff)} ({formatPercent(diffPct ?? 0)})
            </span>
          </div>
        )}
        <div className="rule-double mt-2 flex items-baseline justify-between pt-2">
          <span className="eyebrow">Estimate total</span>
          <span className="figure text-xl text-stamp">
            {estimate.total != null ? formatMoney(estimate.total) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
