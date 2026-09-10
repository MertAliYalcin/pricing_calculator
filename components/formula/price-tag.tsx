"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/money";
import { FormulaBreakdown, FormulaError } from "@/components/formula/formula-breakdown";
import { cn } from "@/lib/utils";
import type { Scope } from "@/lib/formula";

type PriceTagProps =
  | {
      ok: true;
      expression: string;
      scope: Scope;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      size?: "sm" | "lg";
      className?: string;
    }
  | { ok: false; message: string; size?: "sm" | "lg"; className?: string };

const SHEET = "w-96 max-w-[calc(100vw-2rem)] overflow-hidden border-rule p-0";

export function PriceTag(props: PriceTagProps) {
  const size = props.size ?? "sm";

  if (!props.ok) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "eyebrow rounded-sm border border-flag/40 bg-flag/5 px-2 py-1 text-flag transition-colors hover:bg-flag/10",
              props.className,
            )}
          >
            Unpriced
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className={SHEET}>
          <FormulaError message={props.message} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Show how this price is calculated"
          className={cn(
            "figure rounded-sm border-b border-dashed border-graphite/50 px-0.5 text-ink transition-colors hover:border-stamp hover:text-stamp",
            size === "lg" ? "text-lg" : "text-sm",
            props.className,
          )}
        >
          {formatMoney(props.lineTotal)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={SHEET}>
        <FormulaBreakdown
          expression={props.expression}
          scope={props.scope}
          unitPrice={props.unitPrice}
          quantity={props.quantity}
          lineTotal={props.lineTotal}
        />
      </PopoverContent>
    </Popover>
  );
}
