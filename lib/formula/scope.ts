import { RESERVED_IDENTIFIER } from "./parse";

export type ScopeSource = "line_input" | "item_default" | "parameter";

export type ScopeEntry = {
  value: number;
  label: string;
  unit?: string;
  source: ScopeSource;
};

/** Matches SPEC.md §5.4 `Trace["scope"]`. */
export type Scope = Record<string, ScopeEntry>;

export type UnknownIdentifierError = {
  ok: false;
  kind: "unknown_identifier";
  message: string;
  token: string;
};

export type ResolveScopeResult = { ok: true; scope: Scope } | UnknownIdentifierError;

export type ItemInputDef = {
  key: string;
  label: string;
  defaultValue: number;
  unit?: string | null;
};

export type ParameterDef = {
  key: string;
  label: string;
  value: number;
  unit?: string | null;
};

/**
 * Resolves each free identifier in a formula against, in order (SPEC.md
 * §5.3): 1) a line input value the operator typed, 2) the item input's
 * default, 3) a global parameter. The first identifier that resolves
 * nowhere is a hard `unknown_identifier` error — never a silent zero.
 *
 * `qty` is not resolved here: it is reserved and applied separately by
 * evaluate.ts as the quantity multiplier.
 */
export function resolveScope(
  identifiers: string[],
  lineInputs: Record<string, number>,
  itemInputs: ItemInputDef[],
  parameters: ParameterDef[]
): ResolveScopeResult {
  const itemInputByKey = new Map(itemInputs.map((input) => [input.key, input]));
  const parameterByKey = new Map(parameters.map((parameter) => [parameter.key, parameter]));

  const scope: Scope = {};

  for (const id of identifiers) {
    if (id === RESERVED_IDENTIFIER) continue;

    if (Object.prototype.hasOwnProperty.call(lineInputs, id) && lineInputs[id] !== undefined) {
      const itemInput = itemInputByKey.get(id);
      scope[id] = {
        value: lineInputs[id],
        label: itemInput?.label ?? id,
        unit: itemInput?.unit ?? undefined,
        source: "line_input",
      };
      continue;
    }

    const itemInput = itemInputByKey.get(id);
    if (itemInput) {
      scope[id] = {
        value: itemInput.defaultValue,
        label: itemInput.label,
        unit: itemInput.unit ?? undefined,
        source: "item_default",
      };
      continue;
    }

    const parameter = parameterByKey.get(id);
    if (parameter) {
      scope[id] = {
        value: parameter.value,
        label: parameter.label,
        unit: parameter.unit ?? undefined,
        source: "parameter",
      };
      continue;
    }

    return {
      ok: false,
      kind: "unknown_identifier",
      message: `Unknown identifier "${id}". It is not a line input, item input, or parameter.`,
      token: id,
    };
  }

  return { ok: true, scope };
}

export type CollisionCheckResult =
  | { ok: true }
  | { ok: false; kind: "collision"; message: string; key: string };

/**
 * Ambiguity is prevented, not resolved (SPEC.md §5.3): an item input key may
 * not equal any parameter key, and vice versa. `qty` is reserved and may
 * never be used as either. Plain function, reusable from save-time
 * validation for parameters and item inputs alike — not tied to HTTP.
 */
export function checkKeyCollision(
  candidateKey: string,
  existingItemInputKeys: readonly string[],
  existingParameterKeys: readonly string[]
): CollisionCheckResult {
  if (candidateKey === RESERVED_IDENTIFIER) {
    return {
      ok: false,
      kind: "collision",
      message: `"${RESERVED_IDENTIFIER}" is a reserved identifier and cannot be used as a key.`,
      key: candidateKey,
    };
  }

  if (existingParameterKeys.includes(candidateKey)) {
    return {
      ok: false,
      kind: "collision",
      message: `Key "${candidateKey}" collides with an existing parameter key.`,
      key: candidateKey,
    };
  }

  if (existingItemInputKeys.includes(candidateKey)) {
    return {
      ok: false,
      kind: "collision",
      message: `Key "${candidateKey}" collides with an existing item input key.`,
      key: candidateKey,
    };
  }

  return { ok: true };
}
