"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CatalogCategory, CatalogItem } from "@/lib/catalog";
import { evaluateFormula, type ParameterDef } from "@/lib/formula";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PriceTag } from "@/components/formula/price-tag";
import { EditableParameterField } from "@/components/catalog/editable-parameter-field";
import { ItemFormDialog, type CatalogParameterRef } from "@/components/catalog/item-form-dialog";
import { BrandIcon } from "@/components/catalog/brand-icon";

export function ItemCard({
  item,
  categories,
  parameters,
}: {
  item: CatalogItem;
  categories: CatalogCategory[];
  parameters: CatalogParameterRef[];
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [inputValues, setInputValues] = useState<Record<string, number>>(
    Object.fromEntries(item.inputs.map((i) => [i.key, i.defaultValue])),
  );
  const [editableDrafts, setEditableDrafts] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();

  /**
   * Recomputed client-side (not re-fetched from the server) so qty and
   * editable-parameter edits reprice the card immediately, as you type —
   * not only after the PATCH that persists an editable parameter commits.
   * Falls back to the server-computed preview when the formula itself is
   * broken (syntax/unknown identifier), since no local edit can fix that.
   */
  const preview = useMemo(() => {
    if (!item.preview.ok) return item.preview;

    const parameters: ParameterDef[] = Object.entries(item.preview.trace.scope)
      .filter(([, entry]) => entry.source === "parameter")
      .map(([key, entry]) => ({
        key,
        label: entry.label,
        unit: entry.unit,
        value: editableDrafts[key] ?? entry.value,
      }));

    return evaluateFormula({
      expression: item.formula,
      lineInputs: inputValues,
      itemInputs: item.inputs,
      parameters,
      quantity,
    });
  }, [item, inputValues, quantity, editableDrafts]);

  function addToEstimate() {
    startTransition(async () => {
      const res = await fetch("/api/estimate/draft/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity, inputValues }),
      });
      if (!res.ok) {
        toast.error("Could not add this item. Check the formula on the item.");
        return;
      }
      toast.success(`Added ${item.name} to the estimate.`);
      router.refresh();
    });
  }

  function deleteItem() {
    if (!window.confirm(`Delete "${item.name}"? This archives it — past estimates that reference it are unaffected.`)) return;

    startTransition(async () => {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete this item.");
        return;
      }
      toast.success(`Deleted ${item.name}.`);
      router.refresh();
    });
  }

  return (
    <article className="@container flex flex-col rounded-sm border border-rule bg-leaf p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {item.icon && <BrandIcon icon={item.icon} className="mt-0.5" />}
          <div className="min-w-0">
            <h3 className="text-lg leading-tight">{item.name}</h3>
            {item.unitLabel && <div className="eyebrow mt-1">{item.unitLabel}</div>}
          </div>
        </div>
        {preview.ok ? (
          <PriceTag
            ok
            expression={preview.trace.expression}
            scope={preview.trace.scope}
            unitPrice={preview.trace.unitPrice}
            quantity={preview.trace.quantity}
            lineTotal={preview.trace.lineTotal}
          />
        ) : (
          <PriceTag ok={false} message={preview.message} />
        )}
      </header>

      <div className="mt-1 flex items-center gap-2">
        <ItemFormDialog
          mode="edit"
          item={item}
          categories={categories}
          parameters={parameters}
          trigger={
            <button type="button" className="annot text-xs underline decoration-rule underline-offset-2 hover:text-stamp">
              Edit
            </button>
          }
        />
        <button
          type="button"
          disabled={pending}
          onClick={deleteItem}
          className="annot text-xs text-flag underline decoration-rule underline-offset-2 hover:no-underline"
        >
          Delete
        </button>
      </div>

      {item.description && <p className="annot mt-2 text-sm leading-snug">{item.description}</p>}

      {(item.inputs.length > 0 || item.editableParameters.length > 0) && (
        <div className="mt-4 border-t border-rule pt-1">
          {item.inputs.map((input) => (
            <div key={input.key} className="flex items-center justify-between gap-3 border-b border-rule/60 py-1.5">
              <label
                htmlFor={`${item.id}-${input.key}`}
                title={input.unit ? `${input.label} ${input.unit}` : input.label}
                className="min-w-0 truncate text-sm leading-tight text-graphite"
              >
                {input.label}
                {input.unit ? <span className="annot ml-1 text-xs">{input.unit}</span> : null}
              </label>
              <Input
                id={`${item.id}-${input.key}`}
                type="number"
                step="any"
                className="h-8 w-24 border-0 border-b border-rule bg-transparent px-1 text-right shadow-none focus-visible:border-stamp focus-visible:ring-0"
                value={inputValues[input.key]}
                onChange={(e) =>
                  setInputValues((prev) => ({ ...prev, [input.key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
          {item.editableParameters.map((parameter) => (
            <EditableParameterField
              key={parameter.key}
              itemId={item.id}
              parameter={parameter}
              onLiveChange={(value) => setEditableDrafts((prev) => ({ ...prev, [parameter.key]: value }))}
            />
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4 @xs:flex-row @xs:items-center @xs:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor={`${item.id}-qty`} className="eyebrow">
            Qty
          </label>
          <Input
            id={`${item.id}-qty`}
            type="number"
            min={0}
            step="any"
            className="h-8 w-16 border-0 border-b border-rule bg-transparent px-1 text-right shadow-none focus-visible:border-stamp focus-visible:ring-0"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>
        <Button size="sm" onClick={addToEstimate} disabled={pending} className="w-full rounded-sm @xs:w-auto">
          {pending ? "Adding…" : "Add to estimate"}
        </Button>
      </div>
    </article>
  );
}
