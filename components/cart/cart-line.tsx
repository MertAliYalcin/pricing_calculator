"use client";

import type { DraftLineView } from "@/lib/estimate";
import { Input } from "@/components/ui/input";
import { PriceTag } from "@/components/formula/price-tag";

type LineUpdate = { quantity?: number; inputValues?: Record<string, number> };

/** One priced line of the bill: what it is, what it was calculated from, what it comes to. */
export function CartLine({
  line,
  pending,
  onUpdate,
  onRemove,
}: {
  line: DraftLineView;
  pending: boolean;
  onUpdate: (lineId: string, data: LineUpdate) => void;
  onRemove: (lineId: string) => void;
}) {
  const fieldClass =
    "h-7 w-20 border-0 border-b border-rule bg-transparent px-1 text-right text-sm shadow-none focus-visible:border-stamp focus-visible:ring-0";

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-b border-rule/70 py-3">
      <div className="min-w-0">
        <div className="font-serif text-base leading-tight">{line.itemName}</div>
        <code className="figure mt-0.5 block break-all text-xs text-graphite">{line.formula}</code>
      </div>

      <div className="text-right">
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
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor={`qty-${line.id}`} className="eyebrow">
            Qty
          </label>
          <Input
            id={`qty-${line.id}`}
            type="number"
            step="any"
            className={fieldClass}
            defaultValue={line.quantity}
            onBlur={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value) && value !== line.quantity) {
                onUpdate(line.id, { quantity: value });
              }
            }}
          />
        </div>

        {line.ok &&
          Object.entries(line.trace.scope)
            .filter(([, entry]) => entry.source !== "parameter")
            .map(([key, entry]) => (
              <div key={key} className="flex items-center gap-2">
                <label htmlFor={`${line.id}-${key}`} className="eyebrow">
                  {entry.label}
                </label>
                <Input
                  id={`${line.id}-${key}`}
                  type="number"
                  step="any"
                  className={fieldClass}
                  defaultValue={entry.value}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value) && value !== entry.value) {
                      onUpdate(line.id, { inputValues: { ...line.inputValues, [key]: value } });
                    }
                  }}
                />
              </div>
            ))}

        <button
          type="button"
          onClick={() => onRemove(line.id)}
          disabled={pending}
          className="eyebrow ml-auto text-graphite transition-colors hover:text-flag disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
