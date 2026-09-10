"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { DraftView } from "@/lib/estimate";
import { formatMoney } from "@/lib/money";

/** A live read of the current draft while browsing the catalog — full editing (quantities, target budget, saving) stays on /cart. */
export function CatalogDraftPanel({ draft }: { draft: DraftView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function removeLine(lineId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/estimate/draft/lines/${lineId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not remove that line.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <aside className="h-fit border border-rule bg-leaf xl:sticky xl:top-8">
      <div className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <div>
          <div className="eyebrow">Current estimate</div>
          <div className="figure mt-1 text-xl leading-none text-stamp">{formatMoney(draft.total)}</div>
        </div>
        {draft.lines.length > 0 && (
          <span className="eyebrow">
            {draft.lines.length} {draft.lines.length === 1 ? "line" : "lines"}
          </span>
        )}
      </div>

      {draft.lines.length === 0 ? (
        <p className="annot px-4 py-6 text-center text-sm">Add a priced item and it will show up here.</p>
      ) : (
        <ul>
          {draft.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-2 border-b border-rule/60 px-4 py-2.5">
              <div className="min-w-0">
                <div title={line.itemName} className="truncate text-sm leading-tight text-ink">{line.itemName}</div>
                <div className="annot text-xs">Qty {line.quantity}</div>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <span className="figure text-sm">{line.ok ? formatMoney(line.trace.lineTotal) : "—"}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removeLine(line.id)}
                  aria-label={`Remove ${line.itemName}`}
                  className="annot text-xs text-flag hover:no-underline"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft.hasErrors && (
        <p className="border-t border-rule px-4 py-2 text-xs leading-snug text-flag">
          Some lines could not be priced and are left out of the total.
        </p>
      )}

      <div className="border-t border-rule px-4 py-3">
        <Link href="/cart" className="eyebrow text-stamp transition-colors hover:text-ink">
          Open full estimate →
        </Link>
      </div>
    </aside>
  );
}
