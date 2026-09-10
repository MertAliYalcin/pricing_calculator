"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CatalogCategory, CatalogItem } from "@/lib/catalog";
import type { ResolvedIcon } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconPicker } from "@/components/catalog/icon-picker";

export type CatalogParameterRef = {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  group: string | null;
  error: string | null;
};

type DraftInput = { key: string; label: string; defaultValue: string; unit: string };

function emptyInput(): DraftInput {
  return { key: "", label: "", defaultValue: "", unit: "" };
}

function draftFromItem(item: CatalogItem) {
  return {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon,
    unitLabel: item.unitLabel ?? "",
    notes: item.notes ?? "",
    formula: item.formula,
    inputs: item.inputs.map((i) => ({
      key: i.key,
      label: i.label,
      defaultValue: String(i.defaultValue),
      unit: i.unit ?? "",
    })),
  };
}

function extractErrorMessage(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) return "Could not save that item.";
  const { error } = body as { error: unknown };
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof (error as { message: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    const first = fieldErrors && Object.values(fieldErrors).find((v) => v?.length);
    if (first) return first[0];
  }
  return "Could not save that item.";
}

/** Shared form for creating a new catalog item or editing an existing one — same fields, different HTTP verb and starting values. */
export function ItemFormDialog({
  mode,
  categories,
  parameters,
  item,
  trigger,
}: {
  mode: "create" | "edit";
  categories: CatalogCategory[];
  parameters: CatalogParameterRef[];
  item?: CatalogItem;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const formulaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const initial = item ? draftFromItem(item) : null;
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState<ResolvedIcon | null>(initial?.icon ?? null);
  const [unitLabel, setUnitLabel] = useState(initial?.unitLabel ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [formula, setFormula] = useState(initial?.formula ?? "");
  const [inputs, setInputs] = useState<DraftInput[]>(initial?.inputs ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parameterGroups = useMemo(() => {
    const map = new Map<string, CatalogParameterRef[]>();
    for (const p of parameters) {
      const group = p.group ?? "Ungrouped";
      map.set(group, [...(map.get(group) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [parameters]);

  function insertIdentifier(key: string) {
    const el = formulaRef.current;
    if (!el) {
      setFormula((prev) => (prev.length > 0 ? `${prev} ${key}` : key));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${key}${el.value.slice(end)}`;
    setFormula(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + key.length, start + key.length);
    });
  }

  function reset() {
    const base = item ? draftFromItem(item) : null;
    setCategoryId(base?.categoryId ?? categories[0]?.id ?? "");
    setName(base?.name ?? "");
    setDescription(base?.description ?? "");
    setIcon(base?.icon ?? null);
    setUnitLabel(base?.unitLabel ?? "");
    setNotes(base?.notes ?? "");
    setFormula(base?.formula ?? "");
    setInputs(base?.inputs ?? []);
    setError(null);
  }

  function updateInput(index: number, patch: Partial<DraftInput>) {
    setInputs((prev) => prev.map((input, i) => (i === index ? { ...input, ...patch } : input)));
  }

  async function handleSubmit() {
    setError(null);

    if (!categoryId) {
      setError("Choose a category.");
      return;
    }
    if (name.trim().length === 0) {
      setError("Name is required.");
      return;
    }
    if (formula.trim().length === 0) {
      setError("Provide a formula.");
      return;
    }
    for (const input of inputs) {
      if (!/^[a-z][a-z0-9_]*$/.test(input.key)) {
        setError(`Input key "${input.key}" must be snake_case, starting with a letter.`);
        return;
      }
      if (input.label.trim().length === 0 || input.defaultValue.trim() === "") {
        setError("Every input needs a label and a default value.");
        return;
      }
    }

    setSubmitting(true);
    const res = await fetch(mode === "edit" ? `/api/items/${item!.id}` : "/api/items", {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        name,
        description: description.trim() || null,
        icon: icon?.slug ?? null,
        unitLabel: unitLabel.trim() || null,
        notes: notes.trim() || null,
        formula: formula.trim(),
        inputs: inputs.map((input, i) => ({
          key: input.key,
          label: input.label,
          defaultValue: Number(input.defaultValue),
          unit: input.unit.trim() || null,
          sortOrder: i,
        })),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(extractErrorMessage(await res.json().catch(() => null)));
      return;
    }

    toast.success(mode === "edit" ? `Item "${name}" updated.` : `Item "${name}" created.`);
    if (mode === "create") reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[13rem_1fr]">
          <aside className="min-w-0 md:max-h-[65vh] md:overflow-y-auto md:border-r md:border-rule md:pr-4">
            <div className="eyebrow">Parameters</div>
            <p className="annot mt-1 text-xs">Click one to insert it into the formula.</p>
            {parameterGroups.map(([group, rows]) => (
              <div key={group} className="mt-3">
                <div className="annot text-xs font-medium text-graphite">{group}</div>
                <ul>
                  {rows.map((p) => (
                    <li key={p.key}>
                      <button
                        type="button"
                        onClick={() => insertIdentifier(p.key)}
                        className="flex w-full items-baseline justify-between gap-2 border-b border-rule/60 py-1 text-left hover:text-stamp"
                      >
                        <code title={p.key} className="figure truncate text-xs">{p.key}</code>
                        <span className="figure shrink-0 text-xs text-graphite">
                          {p.error ? "—" : p.value}
                          {p.unit && !p.error ? <span className="annot ml-1 text-[0.65rem]">{p.unit}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {parameters.length === 0 && <p className="annot mt-2 text-xs">No parameters defined yet.</p>}
          </aside>

          <div className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="item-category" className="w-full">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-name">Name</Label>
              <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Object storage (cold tier)" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-description">Description</Label>
              <Textarea
                id="item-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-14"
                placeholder="Cold-tier object storage, billed per GB per month."
              />
            </div>

            <IconPicker value={icon} onChange={setIcon} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-unit-label">Unit label</Label>
                <Input id="item-unit-label" value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="per GB per month" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-notes">Notes</Label>
                <Input id="item-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-formula">Formula</Label>
              <Textarea
                id="item-formula"
                ref={formulaRef}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. storage_gb * price_per_gb_month * months"
                className="min-h-16 font-mono text-xs"
              />
              <p className="annot text-xs">References parameters (left) and this item&apos;s own inputs (below).</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Inputs</Label>
                <button
                  type="button"
                  className="annot text-xs underline decoration-rule underline-offset-2 hover:text-stamp"
                  onClick={() => setInputs((prev) => [...prev, emptyInput()])}
                >
                  Add input
                </button>
              </div>
              {inputs.length === 0 && <p className="annot text-xs">No inputs — the formula uses parameters only.</p>}
              {inputs.map((input, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_5rem_4rem_auto] items-center gap-1.5">
                  <Input
                    aria-label="Input key"
                    value={input.key}
                    onChange={(e) => updateInput(i, { key: e.target.value })}
                    placeholder="storage_gb"
                    className="h-8 font-mono text-xs"
                  />
                  <Input
                    aria-label="Input label"
                    value={input.label}
                    onChange={(e) => updateInput(i, { label: e.target.value })}
                    placeholder="Storage"
                    className="h-8 text-xs"
                  />
                  <Input
                    aria-label="Default value"
                    type="number"
                    step="any"
                    value={input.defaultValue}
                    onChange={(e) => updateInput(i, { defaultValue: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    aria-label="Unit"
                    value={input.unit}
                    onChange={(e) => updateInput(i, { unit: e.target.value })}
                    placeholder="GB"
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    className="annot text-xs text-flag hover:underline"
                    onClick={() => setInputs((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-flag">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : mode === "edit" ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
