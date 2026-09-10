"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
import { formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ParameterRow = {
  id: string;
  key: string;
  label: string;
  value: number;
  formula: string | null;
  editable: boolean;
  error: string | null;
  unit: string | null;
  group: string | null;
  description: string | null;
  usedByCount: number;
};

async function postJson(url: string, method: string, body: unknown) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The rate schedule. Editing a value here re-prices every draft line that names the key. */
export function ParametersTable({
  initialParameters,
  existingKeys,
}: {
  initialParameters: ParameterRow[];
  existingKeys: string[];
}) {
  const router = useRouter();
  const [parameters, setParameters] = useState(initialParameters);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ParameterRow[]>();
    for (const p of parameters) {
      const group = p.group ?? "Ungrouped";
      map.set(group, [...(map.get(group) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [parameters]);

  function reportDelta(data: { draftDelta?: { before: number; after: number } | null }) {
    if (!data.draftDelta) return;
    const { before, after } = data.draftDelta;
    const pct = before !== 0 ? ((after - before) / before) * 100 : 0;
    toast(`Draft estimate: ${formatMoney(before)} → ${formatMoney(after)} (${formatPercent(pct)})`);
  }

  function saveValue(id: string, rawValue: string) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    setParameters((prev) => prev.map((p) => (p.id === id ? { ...p, value } : p)));

    startTransition(async () => {
      const res = await postJson(`/api/parameters/${id}`, "PATCH", { value });
      if (!res.ok) {
        toast.error("Could not save that value.");
        return;
      }
      reportDelta(await res.json());
      router.refresh();
    });
  }

  function saveFormula(id: string, formula: string) {
    startTransition(async () => {
      const res = await postJson(`/api/parameters/${id}`, "PATCH", { formula: formula.trim() || null });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Could not save that formula.");
        return;
      }
      reportDelta(await res.json());
      setEditingFormulaId(null);
      router.refresh();
    });
  }

  function saveDetails(id: string, details: { key: string; label: string; group: string | null; unit: string | null; description: string | null }) {
    startTransition(async () => {
      const res = await postJson(`/api/parameters/${id}`, "PATCH", details);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(typeof body?.error === "string" ? body.error : "Could not save those changes.");
        return;
      }
      const data = await res.json();
      setParameters((prev) =>
        prev.map((p) => (p.id === id ? { ...p, key: data.key, label: data.label, group: data.group, unit: data.unit, description: data.description } : p)),
      );
      setEditingDetailsId(null);
      router.refresh();
    });
  }

  function deleteParameterRow(id: string, key: string) {
    if (!window.confirm(`Delete parameter "${key}"?`)) return;

    startTransition(async () => {
      const res = await fetch(`/api/parameters/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const blockers = [
          ...(body?.blockingItems ?? []).map((i: { name: string }) => i.name),
          ...(body?.blockingParameters ?? []).map((p: { key: string }) => p.key),
        ];
        toast.error(
          blockers.length > 0
            ? `Can't delete "${key}" — still used by ${blockers.join(", ")}.`
            : (body?.error ?? "Could not delete that parameter."),
        );
        return;
      }
      setParameters((prev) => prev.filter((p) => p.id !== id));
      toast.success(`Parameter "${key}" deleted.`);
      router.refresh();
    });
  }

  function toggleEditable(id: string, editable: boolean) {
    setParameters((prev) => prev.map((p) => (p.id === id ? { ...p, editable } : p)));

    startTransition(async () => {
      const res = await postJson(`/api/parameters/${id}`, "PATCH", { editable });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Could not update that parameter.");
        setParameters((prev) => prev.map((p) => (p.id === id ? { ...p, editable: !editable } : p)));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <CreateParameterDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          existingKeys={existingKeys}
          onCreated={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      </div>

      {groups.map(([group, rows]) => (
        <section key={group}>
          <h2 className="mb-1 border-b border-ink/15 pb-1.5 text-xl leading-none">{group}</h2>

          <div className="grid grid-cols-[1fr_7rem_5rem] items-baseline gap-x-4 border-b border-rule py-2 sm:grid-cols-[1fr_1fr_8rem_5rem]">
            <span className="eyebrow">Identifier</span>
            <span className="eyebrow hidden sm:block">Description</span>
            <span className="eyebrow text-right">Value</span>
            <span className="eyebrow text-right">Used by</span>
          </div>

          {rows.map((p) => {
            const editingFormula = editingFormulaId === p.id;
            return (
              <div key={p.id} className="border-b border-rule/60 py-2">
                <div className="grid grid-cols-[1fr_7rem_5rem] items-center gap-x-4 sm:grid-cols-[1fr_1fr_8rem_5rem]">
                  <div className="min-w-0">
                    <code title={p.key} className="figure block truncate text-sm text-ink">{p.key}</code>
                    <span title={p.label} className="annot block truncate text-xs sm:hidden">{p.label}</span>
                  </div>
                  <span title={p.label} className="hidden truncate text-sm text-graphite sm:block">{p.label}</span>
                  <div className="flex items-baseline justify-end gap-1.5">
                    {p.formula ? (
                      <span
                        className={cn(
                          "figure text-right text-sm",
                          p.error ? "text-flag" : "text-ink",
                        )}
                        title={p.error ?? undefined}
                      >
                        {p.error ? "Error" : p.value}
                      </span>
                    ) : (
                      <Input
                        type="number"
                        step="any"
                        defaultValue={p.value}
                        disabled={pending}
                        aria-label={`Value for ${p.key}`}
                        className="h-8 w-20 border-0 border-b border-rule bg-transparent px-1 text-right shadow-none focus-visible:border-stamp focus-visible:ring-0"
                        onBlur={(e) => {
                          if (Number(e.target.value) !== p.value) saveValue(p.id, e.target.value);
                        }}
                      />
                    )}
                    <span className="annot w-8 shrink-0 text-xs">{p.unit ?? ""}</span>
                  </div>
                  <span className="figure text-right text-xs text-graphite">
                    {p.usedByCount === 0 ? "—" : p.usedByCount}
                  </span>
                </div>

                <div className="mt-1.5 flex items-start justify-between gap-3">
                  {editingFormula ? (
                    <FormulaInlineEditor
                      initialFormula={p.formula ?? ""}
                      existingKeys={existingKeys.filter((k) => k !== p.key)}
                      pending={pending}
                      onCancel={() => setEditingFormulaId(null)}
                      onSave={(formula) => saveFormula(p.id, formula)}
                    />
                  ) : (
                    <>
                      <div className="min-w-0">
                        {p.formula ? (
                          <code title={p.formula} className="figure block truncate text-xs text-graphite">= {p.formula}</code>
                        ) : (
                          <span className="annot text-xs">{p.editable ? "Editable · shown on catalog" : "Fixed value"}</span>
                        )}
                        {p.error && <p className="mt-0.5 text-xs text-flag">{p.error}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!p.formula && (
                          <button
                            type="button"
                            disabled={pending}
                            className="annot text-xs underline decoration-rule underline-offset-2 hover:text-stamp"
                            onClick={() => toggleEditable(p.id, !p.editable)}
                          >
                            {p.editable ? "Hide from catalog" : "Show on catalog"}
                          </button>
                        )}
                        {!p.editable && (
                          <button
                            type="button"
                            className="annot text-xs underline decoration-rule underline-offset-2 hover:text-stamp"
                            onClick={() => setEditingFormulaId(p.id)}
                          >
                            {p.formula ? "Edit formula" : "Use a formula"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="annot text-xs underline decoration-rule underline-offset-2 hover:text-stamp"
                          onClick={() => setEditingDetailsId(p.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="annot text-xs text-flag underline decoration-rule underline-offset-2 hover:no-underline"
                          onClick={() => deleteParameterRow(p.id, p.key)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <ParameterDetailsDialog
                  open={editingDetailsId === p.id}
                  onOpenChange={(open) => setEditingDetailsId(open ? p.id : null)}
                  parameter={p}
                  submitting={pending}
                  onSave={(details) => saveDetails(p.id, details)}
                />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function FormulaInlineEditor({
  initialFormula,
  existingKeys,
  pending,
  onCancel,
  onSave,
}: {
  initialFormula: string;
  existingKeys: string[];
  pending: boolean;
  onCancel: () => void;
  onSave: (formula: string) => void;
}) {
  const [formula, setFormula] = useState(initialFormula);

  return (
    <div className="w-full space-y-1.5">
      <Textarea
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        placeholder="e.g. senior_day_rate * (1 + overhead_rate)"
        className="min-h-8 font-mono text-xs"
        disabled={pending}
        autoFocus
      />
      <p className="annot text-xs">
        References other parameters: {existingKeys.length > 0 ? existingKeys.join(", ") : "none defined yet"}. Leave
        blank to switch back to a fixed value.
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => onSave(formula)}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CreateParameterDialog({
  open,
  onOpenChange,
  existingKeys,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingKeys: string[];
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"value" | "editable" | "formula">("value");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("");
  const [unit, setUnit] = useState("");
  const [value, setValue] = useState("");
  const [formula, setFormula] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("value");
    setKey("");
    setLabel("");
    setGroup("");
    setUnit("");
    setValue("");
    setFormula("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);

    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError('Key must be snake_case, starting with a letter (e.g. "support_uplift_rate").');
      return;
    }
    if (label.trim().length === 0) {
      setError("Label is required.");
      return;
    }
    if ((mode === "value" || mode === "editable") && value.trim() === "") {
      setError("Provide a value.");
      return;
    }
    if (mode === "formula" && formula.trim() === "") {
      setError("Provide a formula.");
      return;
    }

    setSubmitting(true);
    const res = await postJson("/api/parameters", "POST", {
      key,
      label,
      group: group.trim() || null,
      unit: unit.trim() || null,
      ...(mode === "formula"
        ? { formula: formula.trim() }
        : { value: Number(value), editable: mode === "editable" }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        typeof body?.error === "string"
          ? body.error
          : (body?.error?.fieldErrors?.value?.[0] ?? body?.error?.fieldErrors?.key?.[0] ?? "Could not create that parameter."),
      );
      return;
    }

    toast.success(`Parameter "${key}" created.`);
    reset();
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          New parameter
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New parameter</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="param-key">Key</Label>
            <Input
              id="param-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="support_uplift_rate"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="param-label">Label</Label>
            <Input id="param-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Support plan uplift rate" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="param-group">Group</Label>
              <Input id="param-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Licences" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="param-unit">Unit</Label>
              <Input id="param-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ratio" />
            </div>
          </div>

          <div className="flex gap-1 rounded-lg border border-rule p-0.5">
            <button
              type="button"
              onClick={() => setMode("value")}
              className={cn(
                "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                mode === "value" ? "bg-stamp text-primary-foreground" : "text-graphite hover:text-ink",
              )}
            >
              Fixed value
            </button>
            <button
              type="button"
              onClick={() => setMode("editable")}
              className={cn(
                "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                mode === "editable" ? "bg-stamp text-primary-foreground" : "text-graphite hover:text-ink",
              )}
            >
              Editable
            </button>
            <button
              type="button"
              onClick={() => setMode("formula")}
              className={cn(
                "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                mode === "formula" ? "bg-stamp text-primary-foreground" : "text-graphite hover:text-ink",
              )}
            >
              Formula
            </button>
          </div>

          {mode === "formula" ? (
            <div className="space-y-1.5">
              <Label htmlFor="param-formula">Formula</Label>
              <Textarea
                id="param-formula"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. senior_day_rate * (1 + overhead_rate)"
                className="min-h-16 font-mono text-xs"
              />
              <p className="annot text-xs">
                References other parameters: {existingKeys.length > 0 ? existingKeys.join(", ") : "none defined yet"}.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="param-value">{mode === "editable" ? "Starting value" : "Value"}</Label>
              <Input id="param-value" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
              {mode === "editable" && (
                <p className="annot text-xs">
                  Shown as an input on every catalog item card whose formula references this key.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-flag">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Edits a parameter's key, label, group, unit, and description — everything except value/formula/editable, which have their own inline controls. */
function ParameterDetailsDialog({
  open,
  onOpenChange,
  parameter,
  submitting,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parameter: ParameterRow;
  submitting: boolean;
  onSave: (details: { key: string; label: string; group: string | null; unit: string | null; description: string | null }) => void;
}) {
  const [key, setKey] = useState(parameter.key);
  const [label, setLabel] = useState(parameter.label);
  const [group, setGroup] = useState(parameter.group ?? "");
  const [unit, setUnit] = useState(parameter.unit ?? "");
  const [description, setDescription] = useState(parameter.description ?? "");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setKey(parameter.key);
    setLabel(parameter.label);
    setGroup(parameter.group ?? "");
    setUnit(parameter.unit ?? "");
    setDescription(parameter.description ?? "");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError('Key must be snake_case, starting with a letter (e.g. "support_uplift_rate").');
      return;
    }
    if (label.trim().length === 0) {
      setError("Label is required.");
      return;
    }
    onSave({ key, label, group: group.trim() || null, unit: unit.trim() || null, description: description.trim() || null });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit parameter</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-param-key-${parameter.id}`}>Key</Label>
            <Input
              id={`edit-param-key-${parameter.id}`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono text-sm"
            />
            {key !== parameter.key && (
              <p className="annot text-xs">Renaming rewrites every formula that references &quot;{parameter.key}&quot;.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-param-label-${parameter.id}`}>Label</Label>
            <Input id={`edit-param-label-${parameter.id}`} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-param-group-${parameter.id}`}>Group</Label>
              <Input id={`edit-param-group-${parameter.id}`} value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-param-unit-${parameter.id}`}>Unit</Label>
              <Input id={`edit-param-unit-${parameter.id}`} value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-param-description-${parameter.id}`}>Description</Label>
            <Textarea
              id={`edit-param-description-${parameter.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-14"
            />
          </div>

          {error && <p className="text-xs text-flag">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
