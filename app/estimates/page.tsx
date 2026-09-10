import Link from "next/link";
import { getSavedEstimates } from "@/lib/estimates";
import { formatMoney, formatPercent } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { DeleteEstimateButton } from "@/components/estimates/estimate-actions";

export default async function EstimatesPage() {
  const estimates = await getSavedEstimates();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader
        eyebrow="Archive"
        title="Saved estimates"
        note="Each one is a snapshot: the formulas, values and totals as they stood when it was saved."
      />

      {estimates.length === 0 ? (
        <div className="border border-dashed border-rule px-6 py-16 text-center">
          <h2 className="text-xl">No estimates saved yet</h2>
          <p className="annot mx-auto mt-2 max-w-sm text-sm">
            Build up the current estimate, then save it to keep a fixed copy here.
          </p>
          <Link
            href="/cart"
            className="eyebrow mt-5 inline-block border border-stamp px-4 py-2 text-stamp transition-colors hover:bg-stamp hover:text-leaf"
          >
            Go to the current estimate
          </Link>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_7rem_7rem] items-baseline gap-x-4 border-b border-ink/15 py-2 sm:grid-cols-[1fr_8rem_7rem_7rem_9rem]">
            <span className="eyebrow">Estimate</span>
            <span className="eyebrow hidden sm:block">Saved</span>
            <span className="eyebrow text-right">Total</span>
            <span className="eyebrow hidden text-right sm:block">Target</span>
            <span className="eyebrow text-right">Variance</span>
          </div>

          {estimates.map((estimate) => {
            const diff =
              estimate.total != null && estimate.targetBudget != null
                ? estimate.total - estimate.targetBudget
                : null;
            const diffPct =
              diff != null && estimate.targetBudget ? (diff / estimate.targetBudget) * 100 : null;

            return (
              <div
                key={estimate.id}
                className="flex items-baseline gap-3 border-b border-rule/60 py-3 transition-colors hover:bg-leaf"
              >
                <Link
                  href={`/estimates/${estimate.id}`}
                  className="grid min-w-0 flex-1 grid-cols-[1fr_7rem_7rem] items-baseline gap-x-4 sm:grid-cols-[1fr_8rem_7rem_7rem_9rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-serif text-base">{estimate.name}</span>
                    <span className="annot block truncate text-xs">
                      {estimate.client ?? "No client"}
                      <span className="sm:hidden">
                        {estimate.savedAt ? ` · ${new Date(estimate.savedAt).toLocaleDateString()}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="figure hidden text-xs text-graphite sm:block">
                    {estimate.savedAt ? new Date(estimate.savedAt).toLocaleDateString() : "—"}
                  </span>
                  <span className="figure text-right text-sm">
                    {estimate.total != null ? formatMoney(estimate.total) : "—"}
                  </span>
                  <span className="figure hidden text-right text-sm text-graphite sm:block">
                    {estimate.targetBudget != null ? formatMoney(estimate.targetBudget) : "—"}
                  </span>
                  <span
                    className={`figure text-right text-sm ${
                      diff == null ? "text-graphite" : diff > 0 ? "text-flag" : "text-stamp"
                    }`}
                  >
                    {diff != null ? `${formatMoney(diff)} (${formatPercent(diffPct ?? 0)})` : "—"}
                  </span>
                </Link>
                <DeleteEstimateButton id={estimate.id} name={estimate.name} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
