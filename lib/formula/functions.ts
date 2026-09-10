import { Parser } from "expr-eval";

/**
 * The only functions a formula may call. Anything else — including
 * expr-eval's own built-ins like `atan2`, `hypot`, `random`, `if`, `map`,
 * `fold`, `filter`, `join`, `indexOf`, `roundTo`, `gamma`, `fac` — must be
 * rejected as a "disallowed_function" error, never silently evaluated.
 */
export const ALLOWED_FUNCTIONS = [
  "min",
  "max",
  "abs",
  "round",
  "ceil",
  "floor",
  "sqrt",
  "pow",
  "log",
] as const;

export type AllowedFunction = (typeof ALLOWED_FUNCTIONS)[number];

export const ALLOWED_FUNCTION_SET: ReadonlySet<string> = new Set(ALLOWED_FUNCTIONS);

/**
 * Thrown by our own patched `/` and `%` binary operators so evaluate.ts can
 * tell a real division-by-zero apart from any other non-finite result
 * (e.g. sqrt of a negative number, log of zero, pow overflow).
 */
export class DivisionByZeroError extends Error {
  constructor() {
    super("division by zero");
    this.name = "DivisionByZeroError";
  }
}

function safeDiv(a: number, b: number): number {
  if (b === 0) {
    throw new DivisionByZeroError();
  }
  return a / b;
}

function safeMod(a: number, b: number): number {
  if (b === 0) {
    throw new DivisionByZeroError();
  }
  return a % b;
}

/**
 * expr-eval's `operators` option only gates operators it already knows the
 * name of (see its optionNameMap). Setting a flag to `false` disables the
 * *tokenizer* from recognising that name as an operator/unary-function, so
 * it falls back to being parsed as a plain identifier instead — which is
 * exactly what we want, since evaluate.ts resolves identifiers against a
 * closed scope and rejects anything unresolved.
 *
 * `array` is not present in expr-eval's TypeScript types (older typings than
 * the shipped JS) but is a real option key — hence the loose cast below.
 */
const OPERATOR_FLAGS: Record<string, boolean> = {
  // kept: arithmetic
  add: true,
  subtract: true,
  multiply: true,
  divide: true,
  remainder: true,
  power: true,
  // kept: comparison + ternary (SPEC.md §5.1)
  comparison: true,
  conditional: true,
  // kept: single-argument allowlisted unary functions
  abs: true,
  ceil: true,
  floor: true,
  round: true,
  sqrt: true,
  log: true,
  // everything else: disabled
  concatenate: false,
  factorial: false,
  logical: false,
  assignment: false,
  fndef: false,
  array: false,
  in: false,
  random: false,
  sin: false,
  cos: false,
  tan: false,
  asin: false,
  acos: false,
  atan: false,
  sinh: false,
  cosh: false,
  tanh: false,
  asinh: false,
  acosh: false,
  atanh: false,
  cbrt: false,
  ln: false,
  lg: false,
  log10: false,
  log2: false,
  expm1: false,
  log1p: false,
  trunc: false,
  exp: false,
  length: false,
  sign: false,
};

/** Function names expr-eval registers unconditionally, regardless of the
 * `operators` flags above, and that are not on our allowlist. They must be
 * stripped from every parser instance we hand out. */
const FUNCTIONS_TO_STRIP = [
  "random",
  "fac",
  "hypot",
  "pyt",
  "atan2",
  "if",
  "gamma",
  "roundTo",
  "map",
  "fold",
  "filter",
  "indexOf",
  "join",
];

/**
 * Builds a fresh, restricted expr-eval Parser: no eval/new Function anywhere,
 * a fixed operator set, and a fixed function allowlist. Callers should treat
 * each Parser instance as disposable/stateless.
 */
export function createRestrictedParser(): Parser {
  const options = {
    allowMemberAccess: false,
    operators: OPERATOR_FLAGS,
  } as unknown as ConstructorParameters<typeof Parser>[0];
  const parser = new Parser(options);

  for (const name of FUNCTIONS_TO_STRIP) {
    delete (parser.functions as Record<string, unknown>)[name];
  }

  // Guard against divide-by-zero being silently coerced to Infinity/NaN.
  // `binaryOps` exists at runtime but isn't declared in expr-eval's types.
  const withBinaryOps = parser as unknown as { binaryOps: Record<string, (a: number, b: number) => number> };
  withBinaryOps.binaryOps["/"] = safeDiv;
  withBinaryOps.binaryOps["%"] = safeMod;

  return parser;
}
