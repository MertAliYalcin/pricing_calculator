export { evaluateFormula } from "./evaluate";
export type {
  EvalErrorKind,
  EvalResult,
  EvaluateFormulaInput,
  Trace,
} from "./evaluate";

export { validateFormulaSyntax, extractIdentifiers, RESERVED_IDENTIFIER } from "./parse";
export type {
  FormulaSyntaxError,
  FormulaSyntaxErrorKind,
  FormulaSyntaxResult,
  FormulaSyntaxSuccess,
} from "./parse";

export { resolveScope, checkKeyCollision } from "./scope";
export type {
  CollisionCheckResult,
  ItemInputDef,
  ParameterDef,
  ResolveScopeResult,
  Scope,
  ScopeEntry,
  ScopeSource,
  UnknownIdentifierError,
} from "./scope";

export { ALLOWED_FUNCTIONS, ALLOWED_FUNCTION_SET } from "./functions";
export type { AllowedFunction } from "./functions";

// Convenience alias matching the naming used in the task brief
// (`validateFormula`) — same function as `validateFormulaSyntax`.
export { validateFormulaSyntax as validateFormula } from "./parse";
