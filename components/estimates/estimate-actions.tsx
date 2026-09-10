"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type EstimateDetails = {
  id: string;
  name: string;
  client: string | null;
  notes: string | null;
  targetBudget: number | null;
};

/** Edit (name/client/notes/target budget only — never the frozen totals) and delete for one saved estimate. */
export function EstimateActions({ estimate }: { estimate: EstimateDetails }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(estimate.name);
  const [client, setClient] = useState(estimate.client ?? "");
  const [notes, setNotes] = useState(estimate.notes ?? "");
  const [targetBudget, setTargetBudget] = useState(estimate.targetBudget != null ? String(estimate.targetBudget) : "");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(estimate.name);
    setClient(estimate.client ?? "");
    setNotes(estimate.notes ?? "");
    setTargetBudget(estimate.targetBudget != null ? String(estimate.targetBudget) : "");
    setError(null);
  }

  async function handleSave() {
    setError(null);
    if (name.trim().length === 0) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/estimates/${estimate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        client: client.trim() || null,
        notes: notes.trim() || null,
        targetBudget: targetBudget.trim() === "" ? null : Number(targetBudget),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Could not save those changes.");
      return;
    }

    toast.success("Estimate updated.");
    setEditOpen(false);
    router.refresh();
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${estimate.name}"? This can't be undone.`)) return;

    setDeleting(true);
    (async () => {
      const res = await fetch(`/api/estimates/${estimate.id}`, { method: "DELETE" });
      setDeleting(false);
      if (!res.ok) {
        toast.error("Could not delete this estimate.");
        return;
      }
      toast.success(`Deleted "${estimate.name}".`);
      router.push("/estimates");
      router.refresh();
    })();
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog
        open={editOpen}
        onOpenChange={(next) => {
          if (!next) reset();
          setEditOpen(next);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" className="rounded-sm border-rule bg-transparent">
            Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit estimate</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="annot text-xs">
              Only the name, client, notes and target budget can change here — the saved formulas and totals are a
              frozen snapshot. To reprice, duplicate this estimate into the current draft instead.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="estimate-name">Name</Label>
              <Input id="estimate-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estimate-client">Client</Label>
              <Input id="estimate-client" value={client} onChange={(e) => setClient(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estimate-target">Target budget</Label>
              <Input
                id="estimate-target"
                type="number"
                step="any"
                value={targetBudget}
                onChange={(e) => setTargetBudget(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estimate-notes">Notes</Label>
              <Textarea id="estimate-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
            </div>

            {error && <p className="text-xs text-flag">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button variant="outline" className="rounded-sm border-flag/40 bg-transparent text-flag" onClick={handleDelete} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}

/** A standalone delete link for the saved-estimates list — quick removal without opening the full edit dialog. */
export function DeleteEstimateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;

    setDeleting(true);
    (async () => {
      const res = await fetch(`/api/estimates/${id}`, { method: "DELETE" });
      setDeleting(false);
      if (!res.ok) {
        toast.error("Could not delete this estimate.");
        return;
      }
      toast.success(`Deleted "${name}".`);
      router.refresh();
    })();
  }

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={handleDelete}
      className="annot shrink-0 text-xs text-flag underline decoration-rule underline-offset-2 hover:no-underline"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
