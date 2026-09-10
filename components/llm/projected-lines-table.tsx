"use client";

import type { RepricedLine } from "@/lib/reprice";
import { formatMoney } from "@/lib/money";
import { PriceTag } from "@/components/formula/price-tag";

/**
 * Every line of the projection, grouped by category. Each carries its own price tag, so a
 * projected total can be taken apart line by line exactly like a saved one (CLAUDE.md rule 3).
 */
export function ProjectedLinesTable({ lines }: { lines: RepricedLine[] }) {
  const groups = new Map<string, RepricedLine[]>();
  for (const line of lines) {
    const list = groups.get(line.categoryName) ?? [];
    list.push(line);
    groups.set(line.categoryName, list);
  }

  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([categoryName, categoryLines]) => {
        const subtotal = categoryLines.reduce((sum, l) => (l.ok ? sum + l.trace.lineTotal : sum), 0);

        return (
          <section key={categoryName}>
            <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 pb-2">
              <h3 className="eyebrow">{categoryName}</h3>
              <span className="figure text-xs text-graphite">{formatMoney(subtotal)}</span>
            </div>

            <ul>
              {categoryLines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-baseline justify-between gap-4 border-b border-rule/60 py-2"
                >
                  <span className="min-w-0 truncate text-sm" title={line.itemName}>
                    {line.itemName}
                  </span>
                  {line.ok ? (
                    <PriceTag
                      ok
                      expression={line.trace.expression}
                      scope={line.trace.scope}
                      unitPrice={line.trace.unitPrice}
                      quantity={line.trace.quantity}
                      lineTotal={line.trace.lineTotal}
                    />
                  ) : (
                    <PriceTag ok={false} message={line.message} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
