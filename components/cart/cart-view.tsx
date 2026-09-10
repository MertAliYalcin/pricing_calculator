"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { DraftView } from "@/lib/estimate";
import { formatMoney } from "@/lib/money";
import { CartLine } from "@/components/cart/cart-line";
import { SummarySheet } from "@/components/cart/summary-sheet";

type SavedEstimate = { id: string; name: string; client: string | null };

export function CartView({ draft, savedEstimates }: { draft: DraftView; savedEstimates: SavedEstimate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof draft.lines>();
    for (const line of draft.lines) {
      map.set(line.categoryName, [...(map.get(line.categoryName) ?? []), line]);
    }
    return [...map.entries()];
  }, [draft]);

  /** Every mutation goes out, then the server view is re-read — the draft is the single source of truth. */
  function mutate(request: () => Promise<Response>, errorMessage: string, onDone?: () => void) {
    startTransition(async () => {
      const res = await request();
      if (!res.ok) {
        toast.error(errorMessage);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  const patch = (body: unknown) => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  function updateLine(lineId: string, data: { quantity?: number; inputValues?: Record<string, number> }) {
    mutate(() => fetch(`/api/estimate/draft/lines/${lineId}`, patch(data)), "Could not update that line.");
  }

  function removeLine(lineId: string) {
    mutate(
      () => fetch(`/api/estimate/draft/lines/${lineId}`, { method: "DELETE" }),
      "Could not remove that line.",
    );
  }

  function setTargetBudget(value: string) {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    mutate(() => fetch("/api/estimate/draft", patch({ targetBudget: parsed })), "Could not set the target budget.");
  }

  function clearCart() {
    mutate(() => fetch("/api/estimate/draft", { method: "DELETE" }), "Could not clear the estimate.", () =>
      toast.success("Estimate cleared."),
    );
  }

  function saveEstimate(name: string, client: string) {
    if (!name.trim()) {
      toast.error("Give the estimate a name before saving.");
      return;
    }
    mutate(
      () =>
        fetch("/api/estimate/draft/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, client: client.trim() || null }),
        }),
      "Could not save the estimate.",
      () => {
        toast.success("Estimate saved.");
        setSaveOpen(false);
      },
    );
  }

  function duplicateFromSaved(estimateId: string) {
    if (!estimateId) return;
    mutate(
      () => fetch(`/api/estimates/${estimateId}/duplicate`, { method: "POST" }),
      "Could not copy that estimate in.",
      () => toast.success("Lines copied into the draft."),
    );
  }

  if (draft.lines.length === 0) {
    return (
      <div className="border border-dashed border-rule px-6 py-16 text-center">
        <h2 className="text-xl">Nothing on this estimate yet</h2>
        <p className="annot mx-auto mt-2 max-w-sm text-sm">
          Add priced items from the catalog and they will be listed here, line by line.
        </p>
        <Link
          href="/"
          className="eyebrow mt-5 inline-block border border-stamp px-4 py-2 text-stamp transition-colors hover:bg-stamp hover:text-leaf"
        >
          Browse the catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem] lg:gap-12">
      <div className="min-w-0 space-y-10">
        {grouped.map(([categoryName, lines]) => {
          const subtotal = lines.reduce((sum, l) => (l.ok ? sum + l.trace.lineTotal : sum), 0);
          return (
            <section key={categoryName}>
              <div className="mb-1 flex items-baseline justify-between border-b border-ink/15 pb-1.5">
                <h2 className="text-xl leading-none">{categoryName}</h2>
                <span className="eyebrow">
                  {lines.length} {lines.length === 1 ? "line" : "lines"}
                </span>
              </div>

              {lines.map((line) => (
                <CartLine
                  key={line.id}
                  line={line}
                  pending={pending}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                />
              ))}

              <div className="flex items-baseline justify-between pt-2">
                <span className="eyebrow">{categoryName} subtotal</span>
                <span className="figure text-sm">{formatMoney(subtotal)}</span>
              </div>
            </section>
          );
        })}
      </div>

      <SummarySheet
        draft={draft}
        savedEstimates={savedEstimates}
        pending={pending}
        saveOpen={saveOpen}
        onSaveOpenChange={setSaveOpen}
        onSetTargetBudget={setTargetBudget}
        onClear={clearCart}
        onSave={saveEstimate}
        onDuplicate={duplicateFromSaved}
      />
    </div>
  );
}
