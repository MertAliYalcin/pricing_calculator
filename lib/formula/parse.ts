import { ALLOWED_FUNCTION_SET, createRestrictedParser } from "./functions";

/** `qty` is the reserved line-quantity identifier (SPEC.md §5.2). It is
 * never treated as a free identifier that needs resolving against scope. */
export const RESERVED_IDENTIFIER = "qty";

export type FormulaSyntaxErrorKind = "syntax" | "disallowed_function";

export type FormulaSyntaxError = {
  ok: false;
  kind: FormulaSyntaxErrorKind;
  message: string;
  token?: string;
  position?: number;
};

export type FormulaSyntaxSuccess = {
  ok: true;
  /** Free identifiers referenced by the formula, excluding `qty`. */
  identifiers: string[];
};

export type FormulaSyntaxResult = FormulaSyntaxSuccess | FormulaSyntaxError;

// Matches a bare identifier immediately followed by "(" — i.e. used in
// call position. Used to catch disallowed function calls (e.g. `atan2(...)`,
// `map(...)`) with a clear, specific error before we even hand the
// expression to expr-eval.
const CALL_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

function findDisallowedFunctionCall(expression: string): FormulaSyntaxError | null {
  CALL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CALL_PATTERN.exec(expression)) !== null) {
    const name = match[1];
    if (!ALLOWED_FUNCTION_SET.has(name)) {
      return {
        ok: false,
        kind: "disallowed_function",
        message: `Function "${name}" is not allowed. Allowed functions: ${Array.from(
          ALLOWED_FUNCTION_SET
        ).join(", ")}.`,
        token: name,
        position: match.index,
      };
    }
  }
  return null;
}

/** Extracts a `[line:column]` style position out of expr-eval's error
 * messages, if present, so callers can point at the offending token. */
function extractPosition(message: string): number | undefined {
  const match = /\[(\d+):(\d+)]/.exec(message);
  if (!match) return undefined;
  return Number(match[2]);
}

/**
 * Validates a formula's syntax without evaluating it: no unknown functions,
 * no disallowed syntax (assignment, string/array literals, user-defined
 * functions, member access, logical operators, etc.), and returns the set
 * of free identifiers the formula references (excluding `qty`) on success.
 *
 * Never throws — every failure mode is a structured result, matching the
 * shape `/api/formula/validate` needs to hand back to the client.
 */
export function validateFormulaSyntax(expression: string): FormulaSyntaxResult {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return { ok: false, kind: "syntax", message: "Formula must not be empty." };
  }

  // expr-eval has no operator flag for string literals — "numeric literals
  // only" (SPEC.md §5.1) means we reject quote characters outright.
  const quoteIndex = trimmed.search(/['"]/);
  if (quoteIndex !== -1) {
    return {
      ok: false,
      kind: "syntax",
      message: "String literals are not allowed. Formulas use numeric literals only.",
      position: quoteIndex,
    };
  }

  const disallowed = findDisallowedFunctionCall(trimmed);
  if (disallowed) return disallowed;

  const parser = createRestrictedParser();
  try {
    const parsed = parser.parse(trimmed);
    const identifiers = parsed.variables().filter((id) => id !== RESERVED_IDENTIFIER);
    return { ok: true, identifiers };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      kind: "syntax",
      message,
      position: extractPosition(message),
    };
  }
}

/** Convenience re-export for callers that only need the identifier set and
 * are prepared to treat any failure as "no identifiers". */
export function extractIdentifiers(expression: string): string[] {
  const result = validateFormulaSyntax(expression);
  return result.ok ? result.identifiers : [];
}
