import { evaluateFormula, type ItemInputDef, type ParameterDef, type Trace } from "@/lib/formula";
import { resolveParameterGraph, type RawParameter } from "@/lib/parameters/graph";

/**
 * "What would this set of lines cost if these parameters were different?"
 *
 * The one thing the app could not previously answer: `/api/formula/preview` overrides a line's
 * *inputs*, never a global parameter. This is deliberately pure and Prisma-free so the LLM
 * sandbox can run it in the browser on every keystroke, exactly as `item-card.tsx` runs
 * `evaluateFormula` locally to reprice a card as you type.
 *
 * It never mutates anything and never persists. A projection produced here is not an estimate;
 * saving one is `lib/llm/apply.ts`'s job.
 */

export type RepriceLine = {
  id: string;
  /** The catalog item this line came from, so a snapshot built from it can still be duplicated into a draft. */
  itemId?: string | null;
  itemName: string;
  categoryName: string;
  formula: string;
  quantity: number;
  inputValues: Record<string, number>;
  /** The item's own inputs, so `item_default` identifiers still resolve (SPEC.md §5.3). */
  itemInputs: ItemInputDef[];
};

export type RepricedLine = Omit<RepriceLine, "itemInputs"> &
  ({ ok: true; trace: Trace } | { ok: false; message: string });

export type RejectedOverride = {
  key: string;
  reason: "unknown" | "formula_parameter";
};

export type RepriceResult = {
  lines: RepricedLine[];
  /** The parameters as actually resolved — overrides applied, formulas recomputed, errors dropped. */
  parameters: ParameterDef[];
  /** Unrounded — callers round for display or persistence, never here (SPEC.md §5.5). */
  total: number;
  hasErrors: boolean;
  /** Parameters that would not resolve (cycle, bad formula, missing dependency) — named, not swallowed. */
  parameterErrors: { key: string; error: string }[];
  /** Overrides that could not be applied. A caller bug, surfaced rather than ignored. */
  rejectedOverrides: RejectedOverride[];
};

export function repriceLines({
  lines,
  parameters,
  overrides = {},
}: {
  lines: RepriceLine[];
  parameters: RawParameter[];
  /**
   * Literal-parameter substitutions, applied *before* the graph is resolved so that every
   * formula parameter downstream of an override recomputes rather than keeping a stale value.
   */
  overrides?: Record<string, number>;
}): RepriceResult {
  const rejectedOverrides: RejectedOverride[] = [];
  const byKey = new Map(parameters.map((p) => [p.key, p]));
  const patched: RawParameter[] = parameters.map((p) => ({ ...p }));
  const patchedByKey = new Map(patched.map((p) => [p.key, p]));

  for (const [key, value] of Object.entries(overrides)) {
    const original = byKey.get(key);
    if (!original) {
      rejectedOverrides.push({ key, reason: "unknown" });
      continue;
    }
    // Overriding a derived value would be a lie: the formula would still say one thing while the
    // number said another. Refuse it and say so, rather than silently winning or silently losing.
    if (original.formula != null) {
      rejectedOverrides.push({ key, reason: "formula_parameter" });
      continue;
    }
    patchedByKey.get(key)!.value = value;
  }

  const resolved = resolveParameterGraph(patched);

  const parameterErrors: { key: string; error: string }[] = [];
  const usable: ParameterDef[] = [];
  for (const p of resolved) {
    if (p.error) {
      parameterErrors.push({ key: p.key, error: p.error });
      continue;
    }
    usable.push({ key: p.key, label: p.label, value: p.value, unit: p.unit ?? undefined });
  }
  // Broken parameters are dropped rather than passed through as NaN, so a line that depends on
  // one fails with "unknown identifier <key>" — which names the culprit — instead of the much
  // less useful "result is not a finite number".

  let total = 0;
  const repriced: RepricedLine[] = lines.map((line) => {
    const { itemInputs, ...rest } = line;

    const result = evaluateFormula({
      expression: line.formula,
      lineInputs: line.inputValues,
      itemInputs,
      parameters: usable,
      quantity: line.quantity,
    });

    if (!result.ok) return { ...rest, ok: false, message: result.message };

    // Only priced lines contribute; an errored line is excluded and warned about, never counted
    // as zero (SPEC.md §4.3).
    total += result.trace.lineTotal;
    return { ...rest, ok: true, trace: result.trace };
  });

  return {
    lines: repriced,
    parameters: usable,
    total,
    hasErrors: repriced.some((l) => !l.ok),
    parameterErrors,
    rejectedOverrides,
  };
}
