"use client";

import type { EvalResult } from "@/lib/formula";
import type { RepriceResult } from "@/lib/reprice";
import { formatMoney, formatPercent, roundForDisplay } from "@/lib/money";
import { PriceTag } from "@/components/formula/price-tag";
import { cn } from "@/lib/utils";

/** One labelled figure with its own breakdown popover. */
function TracedRow({ label, result }: { label: string; result: EvalResult }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule/60 py-2">
      <span className="text-sm text-graphite">{label}</span>
      {result.ok ? (
        <PriceTag
          ok
          expression={result.trace.expression}
          scope={result.trace.scope}
          unitPrice={result.trace.unitPrice}
          quantity={result.trace.quantity}
          lineTotal={result.trace.lineTotal}
        />
      ) : (
        <PriceTag ok={false} message={result.message} />
      )}
    </div>
  );
}

/**
 * The figures block. Colour and numbers only — SPEC.md §4.3 rules out feasibility labels, so
 * nothing here says "good" or "over budget"; a cheaper projection simply reads in the stamp green
 * the rest of the app uses for a favourable variance.
 */
export function SandboxSummary({
  blend,
  llmLine,
  projected,
  baselineTotal,
  savedAt,
}: {
  blend: EvalResult;
  llmLine: EvalResult | null;
  projected: RepriceResult;
  baselineTotal: number | null;
  savedAt: Date | string | null;
}) {
  // Rounded before it is judged: an unrounded reprice of the same selection lands a floating-point
  // crumb (~1e-11) away from the frozen total, and an unrounded comparison would paint that as an
  // increase — "no change" must read as no change.
  const rawDelta = baselineTotal == null ? null : projected.total - baselineTotal;
  const delta = rawDelta == null ? null : roundForDisplay(rawDelta);
  const deltaPct =
    delta == null || baselineTotal == null || baselineTotal === 0 ? null : (delta / baselineTotal) * 100;
  const savedLabel = savedAt ? new Date(savedAt).toLocaleDateString("en-GB", { dateStyle: "medium" }) : null;

  return (
    <div>
      <TracedRow label="Blended cost per query" result={blend} />
      {llmLine && <TracedRow label="LLM inference, monthly" result={llmLine} />}

      <div className="rule-double mt-4 pt-3">
        <div className="flex items-baseline justify-between gap-4 py-1">
          <span className="eyebrow">Projected monthly total</span>
          <span className="figure text-lg">{formatMoney(projected.total)}</span>
        </div>

        {baselineTotal != null && (
          <>
            <div className="flex items-baseline justify-between gap-4 py-1">
              <span className="text-sm text-graphite">
                Baseline{savedLabel ? ` (as saved ${savedLabel})` : ""}
              </span>
              <span className="figure text-sm text-graphite">{formatMoney(baselineTotal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-1">
              <span className="text-sm text-graphite">Delta</span>
              <span
                className={cn(
                  "figure text-sm",
                  !delta ? "text-graphite" : delta > 0 ? "text-flag" : "text-stamp",
                )}
              >
                {formatMoney(delta ?? 0)}
                {delta !== 0 && deltaPct != null && ` (${formatPercent(deltaPct)})`}
              </span>
            </div>
          </>
        )}
      </div>

      {projected.parameterErrors.length > 0 && (
        <p className="annot mt-4 text-xs text-flag">
          {projected.parameterErrors.length} parameter
          {projected.parameterErrors.length === 1 ? "" : "s"} could not be resolved and were excluded:{" "}
          {projected.parameterErrors.map((e) => e.key).join(", ")}.
        </p>
      )}
      {projected.hasErrors && (
        <p className="annot mt-2 text-xs text-flag">
          Some lines could not be priced and are excluded from the total above.
        </p>
      )}
      {projected.rejectedOverrides.length > 0 && (
        <p className="annot mt-2 text-xs text-flag">
          Ignored override{projected.rejectedOverrides.length === 1 ? "" : "s"}:{" "}
          {projected.rejectedOverrides.map((o) => `${o.key} (${o.reason.replace("_", " ")})`).join(", ")}.
        </p>
      )}
    </div>
  );
}
