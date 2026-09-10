/**
 * The parameter dependency graph, resolved. Deliberately split out of `./index.ts`:
 * this file is imported by client components, so it must stay free of `@/lib/db` —
 * adding a Prisma import here drags the whole client into the browser bundle.
 * Server code can keep importing everything from `@/lib/parameters`.
 */
import { evaluateFormula, validateFormula } from "@/lib/formula";

export type RawParameter = {
  id?: string;
  key: string;
  label: string;
  value: number;
  unit: string | null;
  /** A formula over other parameter keys. Null means `value` is a plain literal. */
  formula: string | null;
  /** Only meaningful when `formula` is null: shows an input for this parameter on catalog item cards. */
  editable?: boolean;
};

export type ResolvedParameter = {
  id?: string;
  key: string;
  label: string;
  unit: string | null;
  /** NaN when `error` is set — never treat as a usable number. */
  value: number;
  formula: string | null;
  editable: boolean;
  error: string | null;
};

/**
 * Flattens a set of parameters — some literal, some formulas over other
 * parameter keys — into resolved numbers. A formula parameter may only
 * reference other parameters (no item inputs, no `qty`); an unresolvable
 * identifier or a circular reference produces an `error` on that node
 * rather than a `0` or a crash (CLAUDE.md "fail visibly").
 */
export function resolveParameterGraph(raw: RawParameter[]): ResolvedParameter[] {
  const byKey = new Map(raw.map((p) => [p.key, p]));
  const resolved = new Map<string, ResolvedParameter>();
  const stack = new Set<string>();

  function resolve(key: string): ResolvedParameter {
    const cached = resolved.get(key);
    if (cached) return cached;

    const p = byKey.get(key);
    if (!p) {
      const r: ResolvedParameter = {
        key,
        label: key,
        unit: null,
        value: NaN,
        formula: null,
        editable: false,
        error: `Unknown identifier "${key}". Parameter formulas may only reference other parameters.`,
      };
      resolved.set(key, r);
      return r;
    }

    if (!p.formula) {
      const r: ResolvedParameter = {
        id: p.id,
        key: p.key,
        label: p.label,
        unit: p.unit,
        value: p.value,
        formula: null,
        editable: p.editable ?? false,
        error: null,
      };
      resolved.set(key, r);
      return r;
    }

    if (stack.has(key)) {
      const r: ResolvedParameter = {
        id: p.id,
        key: p.key,
        label: p.label,
        unit: p.unit,
        value: NaN,
        formula: p.formula,
        editable: false,
        error: `Circular reference: "${key}" depends on itself through its formula.`,
      };
      resolved.set(key, r);
      return r;
    }

    stack.add(key);

    const syntax = validateFormula(p.formula);
    if (!syntax.ok) {
      stack.delete(key);
      const r: ResolvedParameter = {
        id: p.id,
        key: p.key,
        label: p.label,
        unit: p.unit,
        value: NaN,
        formula: p.formula,
        editable: false,
        error: syntax.message,
      };
      resolved.set(key, r);
      return r;
    }

    const depDefs: { key: string; label: string; value: number; unit?: string }[] = [];
    let error: string | null = null;
    for (const id of syntax.identifiers) {
      const dep = resolve(id);
      if (dep.error) {
        error = dep.error;
        break;
      }
      depDefs.push({ key: dep.key, label: dep.label, value: dep.value, unit: dep.unit ?? undefined });
    }

    stack.delete(key);

    if (error) {
      const r: ResolvedParameter = {
        id: p.id,
        key: p.key,
        label: p.label,
        unit: p.unit,
        value: NaN,
        formula: p.formula,
        editable: false,
        error,
      };
      resolved.set(key, r);
      return r;
    }

    const evaluated = evaluateFormula({ expression: p.formula, lineInputs: {}, itemInputs: [], parameters: depDefs, quantity: 1 });
    const r: ResolvedParameter = evaluated.ok
      ? {
          id: p.id,
          key: p.key,
          label: p.label,
          unit: p.unit,
          value: evaluated.trace.unitPrice,
          formula: p.formula,
          editable: false,
          error: null,
        }
      : {
          id: p.id,
          key: p.key,
          label: p.label,
          unit: p.unit,
          value: NaN,
          formula: p.formula,
          editable: false,
          error: evaluated.message,
        };
    resolved.set(key, r);
    return r;
  }

  for (const p of raw) resolve(p.key);
  return raw.map((p) => resolved.get(p.key)!);
}
