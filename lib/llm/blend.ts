import { evaluateFormula, type EvalResult, type ParameterDef } from "@/lib/formula";
import { roundForPersistence } from "@/lib/money";
import type { ResolvedLlmModel } from "@/lib/llm/models";

/**
 * The blended per-query cost of a two-model (N1/N2) split, over a fixed token shape.
 *
 * This is the same construction the Normo workbook uses for its Haiku (Assumptions!B31) and
 * Sonnet 5 (B48) alternatives: hold the tokens-per-query shape still, and let the model prices
 * be the only thing that moves.
 *
 * It is a formula string rather than TypeScript arithmetic on purpose. CLAUDE.md rule 3 — every
 * price the UI shows must explain itself — so the blend goes through `evaluateFormula` and comes
 * back with a `Trace`, which a `PriceTag` can render for free. The same string is what
 * `prisma/seed.ts` persists as the `blended_llm_cost_per_query` parameter's formula, so the
 * sandbox and the database can never disagree about how the number is derived.
 */
export const BLENDED_LLM_COST_FORMULA =
  "n1_traffic_share * (input_tokens_per_query / 1000000 * n1_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * n1_output_price_per_1m_tokens) + (1 - n1_traffic_share) * (input_tokens_per_query / 1000000 * n2_input_price_per_1m_tokens + output_tokens_per_query / 1000000 * n2_output_price_per_1m_tokens)";

/**
 * The parameters a model selection owns. These are the only keys "Apply to Normo" writes, and
 * the only ones the sandbox overrides — everything else about the estimate is left alone.
 */
export const LLM_SELECTION_PARAMETER_KEYS = [
  "n1_traffic_share",
  "n1_input_price_per_1m_tokens",
  "n1_output_price_per_1m_tokens",
  "n2_input_price_per_1m_tokens",
  "n2_output_price_per_1m_tokens",
] as const;

export type LlmSelectionParameterKey = (typeof LLM_SELECTION_PARAMETER_KEYS)[number];

/** The two token anchors the blend prices against — `input_tokens_per_query` is itself derived. */
export const LLM_TOKEN_SHAPE_PARAMETER_KEYS = [
  "input_tokens_per_query",
  "output_tokens_per_query",
] as const;

export type LlmSelection = {
  n1: ResolvedLlmModel;
  n2: ResolvedLlmModel;
  /** Share of queries served by N1, 0–1. N2 gets the remainder. */
  n1TrafficShare: number;
};

export type LlmTokenShape = {
  inputTokensPerQuery: number;
  outputTokensPerQuery: number;
};

/**
 * The five literal parameter values a selection implies, already rounded to the 6 decimals
 * `Parameter.value` (`numeric(18,6)`) can actually hold — so what the sandbox previews is
 * exactly what Apply will persist, with no late rounding surprise.
 */
export function selectionParameterValues(
  selection: LlmSelection,
): Record<LlmSelectionParameterKey, number> {
  return {
    n1_traffic_share: roundForPersistence(selection.n1TrafficShare),
    n1_input_price_per_1m_tokens: roundForPersistence(selection.n1.inputPricePerM),
    n1_output_price_per_1m_tokens: roundForPersistence(selection.n1.outputPricePerM),
    n2_input_price_per_1m_tokens: roundForPersistence(selection.n2.inputPricePerM),
    n2_output_price_per_1m_tokens: roundForPersistence(selection.n2.outputPricePerM),
  };
}

/**
 * A self-explaining blended $/query for the given selection. Labels name the chosen models, so
 * the breakdown popover reads "GPT-5.1 — input price per 1M tokens · 1.25 · USD/M tokens"
 * rather than an anonymous `n1_input_price_per_1m_tokens`.
 *
 * Returns the engine's `EvalResult` unchanged: an error stays a structured error and never
 * degrades into `NaN` or `0` (CLAUDE.md rule 5).
 */
export function evaluateBlendedCostPerQuery(
  selection: LlmSelection,
  tokens: LlmTokenShape,
): EvalResult {
  const values = selectionParameterValues(selection);

  const parameters: ParameterDef[] = [
    { key: "n1_traffic_share", label: "N1 share of traffic", value: values.n1_traffic_share, unit: "share of queries" },
    { key: "input_tokens_per_query", label: "Input tokens per query", value: tokens.inputTokensPerQuery, unit: "tokens/query" },
    { key: "output_tokens_per_query", label: "Output tokens per query", value: tokens.outputTokensPerQuery, unit: "tokens/query" },
    { key: "n1_input_price_per_1m_tokens", label: `${selection.n1.name} — input price per 1M tokens`, value: values.n1_input_price_per_1m_tokens, unit: "USD/M tokens" },
    { key: "n1_output_price_per_1m_tokens", label: `${selection.n1.name} — output price per 1M tokens`, value: values.n1_output_price_per_1m_tokens, unit: "USD/M tokens" },
    { key: "n2_input_price_per_1m_tokens", label: `${selection.n2.name} — input price per 1M tokens`, value: values.n2_input_price_per_1m_tokens, unit: "USD/M tokens" },
    { key: "n2_output_price_per_1m_tokens", label: `${selection.n2.name} — output price per 1M tokens`, value: values.n2_output_price_per_1m_tokens, unit: "USD/M tokens" },
  ];

  return evaluateFormula({
    expression: BLENDED_LLM_COST_FORMULA,
    lineInputs: {},
    itemInputs: [],
    parameters,
    quantity: 1,
  });
}
