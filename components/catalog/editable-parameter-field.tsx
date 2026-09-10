"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EditableCatalogParameter } from "@/lib/catalog";
import { Input } from "@/components/ui/input";
import { formatMoney, formatPercent } from "@/lib/money";

/**
 * An input for a catalog-editable global parameter, shown on every item
 * card whose formula references it. Unlike an item input, editing this
 * writes straight to the parameter (PATCH /api/parameters/:id) — the value
 * is shared, not per line — so every other card referencing the same
 * parameter must pick up the change too.
 *
 * The input is uncontrolled and keyed by `parameter.value`: after
 * router.refresh() re-fetches server data, a sibling card's copy of this
 * component receives a new `value` prop but is the *same* component
 * instance (same position in the tree), so a plain `defaultValue` would
 * never update. Keying on the value forces React to remount the input
 * with the fresh default whenever it changes — including from elsewhere.
 */
export function EditableParameterField({
  itemId,
  parameter,
  onLiveChange,
}: {
  itemId: string;
  parameter: EditableCatalogParameter;
  /** Fired on every keystroke (not just on commit) so the card's price preview can recompute live. */
  onLiveChange?: (value: number) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function commit(rawValue: string) {
    const next = Number(rawValue);
    if (!Number.isFinite(next) || next === parameter.value) return;

    startTransition(async () => {
      const res = await fetch(`/api/parameters/${parameter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) {
        toast.error("Could not save that value.");
        return;
      }
      const data = await res.json();
      if (data.draftDelta) {
        const { before, after } = data.draftDelta as { before: number; after: number };
        const pct = before !== 0 ? ((after - before) / before) * 100 : 0;
        toast(`Draft estimate: ${formatMoney(before)} → ${formatMoney(after)} (${formatPercent(pct)})`);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule/60 py-1.5">
      <label
        htmlFor={`${itemId}-param-${parameter.key}`}
        title={parameter.unit ? `${parameter.label} (shared) ${parameter.unit}` : `${parameter.label} (shared)`}
        className="min-w-0 truncate text-sm leading-tight text-graphite"
      >
        {parameter.label}
        <span className="annot ml-1 text-xs">(shared)</span>
        {parameter.unit ? <span className="annot ml-1 text-xs">{parameter.unit}</span> : null}
      </label>
      <Input
        key={parameter.value}
        id={`${itemId}-param-${parameter.key}`}
        type="number"
        step="any"
        disabled={pending}
        className="h-8 w-24 border-0 border-b border-rule bg-transparent px-1 text-right shadow-none focus-visible:border-stamp focus-visible:ring-0"
        defaultValue={parameter.value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onLiveChange?.(next);
        }}
        onBlur={(e) => commit(e.target.value)}
      />
    </div>
  );
}
