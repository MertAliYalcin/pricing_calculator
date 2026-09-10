"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

/** The only thing on this page that writes. Everything above it is a projection. */
export function ApplyToNormoButton({
  estimateId,
  n1ModelId,
  n2ModelId,
  n1TrafficShare,
  n1Name,
  n2Name,
  projectedTotal,
  disabled,
}: {
  estimateId: string;
  n1ModelId: string;
  n2ModelId: string;
  n1TrafficShare: number;
  n1Name: string;
  n2Name: string;
  projectedTotal: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function apply() {
    startTransition(async () => {
      const res = await fetch("/api/llm/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n1ModelId, n2ModelId, n1TrafficShare, estimateId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Could not apply this selection.");
        return;
      }

      const result = await res.json();
      toast.success(`Saved "${result.estimateName}"`, {
        description:
          result.baselineTotal != null
            ? `${formatMoney(result.baselineTotal)} → ${formatMoney(result.total)}. The baseline estimate is unchanged.`
            : `${formatMoney(result.total)} per month.`,
      });
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button type="button" disabled={disabled || pending} onClick={() => setConfirming(true)}>
        Apply to Normo
      </Button>
    );
  }

  return (
    <div className="border border-rule bg-leaf p-4">
      <p className="text-sm">
        Set the five N1/N2 selection parameters to {n1Name} / {n2Name}, then save the result as a new
        estimate at {formatMoney(projectedTotal)} per month.
      </p>
      <p className="annot mt-1 text-xs">
        The baseline estimate keeps its own frozen numbers — nothing already saved is overwritten.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" onClick={apply} disabled={pending}>
          {pending ? "Applying…" : "Confirm"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
