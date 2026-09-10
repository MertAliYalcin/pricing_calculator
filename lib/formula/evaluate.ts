import { DivisionByZeroError, createRestrictedParser } from "./functions";
import { RESERVED_IDENTIFIER, validateFormulaSyntax } from "./parse";
import {
  type ItemInputDef,
  type ParameterDef,
  type Scope,
  resolveScope,
} from "./scope";

export type { ScopeEntry, ScopeSource, ItemInputDef, ParameterDef } from "./scope";

/** Matches SPEC.md §5.4 exactly. */
export type Trace = {
  expression: string;
  scope: Scope;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type EvalErrorKind =
  | "syntax"
  | "unknown_identifier"
  | "disallowed_function"
  | "division_by_zero"
  | "non_finite";

export type EvalResult =
  | { ok: true; trace: Trace }
  | { ok: false; kind: EvalErrorKind; message: string; token?: string; position?: number };

export type EvaluateFormulaInput = {
  expression: string;
  /** Values the operator typed for this specific line, keyed by identifier. */
  lineInputs: Record<string, number>;
  itemInputs: ItemInputDef[];
  parameters: ParameterDef[];
  quantity: number;
};

/**
 * The single entry point for turning a formula + scope into a priced,
 * self-explaining `Trace`. Every price the UI shows must come from here (or
 * from a frozen snapshot of a previous call) — see CLAUDE.md "The formula
 * engine is the load-bearing part", rule 3.
 *
 * Never throws: expr-eval's exceptions are caught and translated into the
 * structured `EvalResult` error shape. Never rounds: rounding is a display /
 * persistence concern for callers, not this module's job.
 */
export function evaluateFormula(input: EvaluateFormulaInput): EvalResult {
  const { expression, lineInputs, itemInputs, parameters, quantity } = input;

  const syntax = validateFormulaSyntax(expression);
  if (!syntax.ok) {
    return {
      ok: false,
      kind: syntax.kind,
      message: syntax.message,
      token: syntax.token,
      position: syntax.position,
    };
  }

  const resolved = resolveScope(syntax.identifiers, lineInputs, itemInputs, parameters);
  if (!resolved.ok) {
    return {
      ok: false,
      kind: "unknown_identifier",
      message: resolved.message,
      token: resolved.token,
    };
  }

  const scope = resolved.scope;
  const substitution: Record<string, number> = { [RESERVED_IDENTIFIER]: quantity };
  for (const [key, entry] of Object.entries(scope)) {
    substitution[key] = entry.value;
  }

  const parser = createRestrictedParser();
  let unitPrice: number;
  try {
    unitPrice = parser.evaluate(expression, substitution);
  } catch (error) {
    if (error instanceof DivisionByZeroError) {
      return { ok: false, kind: "division_by_zero", message: "Division by zero." };
    }
    const message = error instanceof Error ? error.message : String(error);
    // Should be unreachable in practice: syntax and identifiers were already
    // validated above. Kept as a defensive fallback rather than an
    // uncaught throw, per CLAUDE.md rule 5 ("fail visibly", never crash).
    const unknownVariable = /undefined variable: (.+)$/.exec(message);
    if (unknownVariable) {
      return {
        ok: false,
        kind: "unknown_identifier",
        message,
        token: unknownVariable[1],
      };
    }
    return { ok: false, kind: "syntax", message };
  }

  if (typeof unitPrice !== "number" || Number.isNaN(unitPrice) || !Number.isFinite(unitPrice)) {
    return {
      ok: false,
      kind: "non_finite",
      message: `Formula produced a non-finite result (${String(unitPrice)}).`,
    };
  }

  const lineTotal = unitPrice * quantity;
  if (Number.isNaN(lineTotal) || !Number.isFinite(lineTotal)) {
    return {
      ok: false,
      kind: "non_finite",
      message: `Line total is non-finite (unit price ${unitPrice} × quantity ${quantity}).`,
    };
  }

  return {
    ok: true,
    trace: {
      expression,
      scope,
      unitPrice,
      quantity,
      lineTotal,
    },
  };
}
