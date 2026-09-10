"use client";

import { useState } from "react";
import type { DraftView } from "@/lib/estimate";
import { formatMoney, formatPercent } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveEstimateDialog } from "@/components/cart/save-estimate-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SavedEstimate = { id: string; name: string; client: string | null };

/** The summary sheet clipped to the bill: total, the budget it is measured against, and what to do next. */
export function SummarySheet({
  draft,
  savedEstimates,
  pending,
  saveOpen,
  onSaveOpenChange,
  onSetTargetBudget,
  onClear,
  onSave,
  onDuplicate,
}: {
  draft: DraftView;
  savedEstimates: SavedEstimate[];
  pending: boolean;
  saveOpen: boolean;
  onSaveOpenChange: (open: boolean) => void;
  onSetTargetBudget: (value: string) => void;
  onClear: () => void;
  onSave: (name: string, client: string) => void;
  onDuplicate: (estimateId: string) => void;
}) {
  const [duplicateFrom, setDuplicateFrom] = useState("");

  const target = draft.targetBudget;
  const diff = target != null ? draft.total - target : null;
  const diffPct = diff != null && target ? (diff / target) * 100 : null;
  const used = target ? Math.min((draft.total / target) * 100, 100) : 0;
  const over = diff != null && diff > 0;

  return (
    <aside className="h-fit border border-rule bg-leaf lg:sticky lg:top-8">
      <div className="px-4 pb-4 pt-3">
        <div className="eyebrow">Estimate total</div>
        <div className="figure mt-1 text-3xl leading-none text-stamp">{formatMoney(draft.total)}</div>

        {draft.hasErrors && (
          <p className="mt-3 border-l-2 border-flag bg-flag/5 px-3 py-2 text-xs leading-snug text-flag">
            Some lines could not be priced. They are left out of this total until their formulas resolve.
          </p>
        )}
      </div>

      <div className="border-t border-rule px-4 py-3">
        <Label htmlFor="target-budget" className="eyebrow">
          Target budget
        </Label>
        <Input
          id="target-budget"
          type="number"
          step="any"
          defaultValue={target ?? ""}
          placeholder="None set"
          className="mt-2 h-9 bg-paper text-right"
          onBlur={(e) => onSetTargetBudget(e.target.value)}
        />

        {target != null && diff != null && (
          <div className="mt-3">
            <div className="h-1.5 w-full bg-rule">
              <div className={over ? "h-full bg-flag" : "h-full bg-stamp"} style={{ width: `${used}%` }} />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="annot text-xs">{over ? "Over budget by" : "Under budget by"}</span>
              <span className={`figure text-sm ${over ? "text-flag" : "text-stamp"}`}>
                {formatMoney(Math.abs(diff))} ({formatPercent(diffPct ?? 0)})
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-rule px-4 py-3">
        <SaveEstimateDialog
          open={saveOpen}
          onOpenChange={onSaveOpenChange}
          disabled={draft.lines.length === 0}
          pending={pending}
          onSave={onSave}
        />
        <Button
          variant="outline"
          className="w-full rounded-sm border-rule bg-transparent"
          onClick={onClear}
          disabled={pending || draft.lines.length === 0}
        >
          Clear all lines
        </Button>
      </div>

      {savedEstimates.length > 0 && (
        <div className="border-t border-rule px-4 py-3">
          <div className="eyebrow">Start from a saved estimate</div>
          <div className="mt-2 flex gap-2">
            <Select value={duplicateFrom} onValueChange={setDuplicateFrom}>
              <SelectTrigger className="h-9 flex-1 rounded-sm border-rule bg-paper">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {savedEstimates.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="rounded-sm border-rule bg-transparent"
              onClick={() => onDuplicate(duplicateFrom)}
              disabled={!duplicateFrom || pending}
            >
              Copy in
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
