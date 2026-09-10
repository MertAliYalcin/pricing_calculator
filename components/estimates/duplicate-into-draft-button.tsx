"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DuplicateIntoDraftButton({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function duplicate() {
    startTransition(async () => {
      const res = await fetch(`/api/estimates/${estimateId}/duplicate`, { method: "POST" });
      if (!res.ok) {
        toast.error("Could not copy these lines into the current estimate.");
        return;
      }
      toast.success("Lines copied into the current estimate.");
      router.push("/cart");
    });
  }

  return (
    <Button
      variant="outline"
      className="rounded-sm border-rule bg-transparent"
      onClick={duplicate}
      disabled={pending}
    >
      Copy into current estimate
    </Button>
  );
}
