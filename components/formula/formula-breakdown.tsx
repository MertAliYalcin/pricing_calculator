import Link from "next/link";
import { formatMoney } from "@/lib/money";
import type { Scope, ScopeEntry } from "@/lib/formula";

const SOURCE_LABEL: Record<string, string> = {
  line_input: "line input",
  item_default: "item default",
  parameter: "parameter",
};

/** Saved snapshots tag entries whose live parameter has since moved. */
type TracedEntry = ScopeEntry & { changedSinceSave?: boolean };

/**
 * The trace slip: every price in this app can show its own arithmetic.
 * Reads top to bottom like a priced ledger line — expression, the values
 * that filled it and where each came from, the substitution, the total.
 */
export function FormulaBreakdown({
  expression,
  scope,
  unitPrice,
  quantity,
  lineTotal,
}: {
  expression: string;
  scope: Scope;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}) {
  const entries = Object.entries(scope) as [string, TracedEntry][];

  const substituted = entries.reduce(
    (expr, [key, entry]) => expr.replaceAll(new RegExp(`\\b${key}\\b`, "g"), entry.value.toString()),
    expression,
  );

  return (
    <div className="bg-leaf">
      <div className="border-b border-rule px-3 py-2">
        <div className="eyebrow">Formula</div>
        <code className="figure mt-1 block break-all text-[0.8rem] leading-relaxed text-ink">
          {expression}
        </code>
      </div>

      {entries.length > 0 && (
        <div className="border-b border-rule">
          <div className="flex items-baseline justify-between px-3 pt-2">
            <span className="eyebrow">Identifier</span>
            <span className="eyebrow">Value</span>
          </div>
          <dl className="px-3 pb-2">
            {entries.map(([key, entry]) => (
              <div key={key} className="flex items-baseline gap-3 border-b border-rule/60 py-1.5 last:border-0">
                <dt title={`${key} — ${SOURCE_LABEL[entry.source]}`} className="min-w-0 flex-1 truncate">
                  <code className="figure text-[0.8rem] text-ink">{key}</code>
                  <span className="annot ml-2 text-xs">
                    {entry.source === "parameter" ? (
                      <Link href="/parameters" className="underline decoration-rule underline-offset-2 hover:text-stamp">
                        {SOURCE_LABEL[entry.source]}
                      </Link>
                    ) : (
                      SOURCE_LABEL[entry.source]
                    )}
                    {entry.changedSinceSave && <span className="text-pencil"> · changed since save</span>}
                  </span>
                </dt>
                <dd className="figure shrink-0 text-[0.8rem] text-ink">
                  {entry.value}
                  {entry.unit ? <span className="annot ml-1 text-xs not-italic">{entry.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="border-b border-rule px-3 py-2">
        <div className="eyebrow">Arithmetic</div>
        <div className="figure mt-1 space-y-0.5 text-[0.8rem]">
          <div className="break-all text-graphite">
            {substituted} = {unitPrice}
          </div>
          <div className="text-ink">
            {unitPrice} × {quantity} = {lineTotal}
          </div>
        </div>
      </div>

      <div className="rule-double mx-3 my-0 flex items-baseline justify-between py-2">
        <span className="eyebrow">Line total</span>
        <span className="figure text-base font-medium text-stamp">{formatMoney(lineTotal)}</span>
      </div>
    </div>
  );
}

export function FormulaError({ message }: { message: string }) {
  return (
    <div className="bg-leaf px-3 py-2">
      <div className="eyebrow text-flag">Cannot price this line</div>
      <p className="mt-1 text-sm leading-snug text-ink">{message}</p>
      <p className="annot mt-2 text-xs">Excluded from the estimate total until it resolves.</p>
    </div>
  );
}
