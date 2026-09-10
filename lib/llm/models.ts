/**
 * Published per-token prices for the model families a Normo-shaped project might use.
 *
 * Hand-transcribed, never fetched at runtime (SPEC.md §2) — every provider carries the page
 * the numbers were read off and the date they were read, so the table can be audited against
 * its source. Deliberately import-free: this module is pulled into the browser bundle by the
 * model pickers *and* read by `prisma/seed.ts`, so it must stay pure data.
 *
 * Prices are USD per 1,000,000 tokens, at each provider's standard (non-batch, non-cached)
 * rate. Where a provider tiers by context length or time of day, the headline row is the
 * cheaper/standard tier and the qualifier goes in `note` — a `note` is display-only and never
 * enters a calculation.
 *
 * Refreshing prices: edit the numbers, bump `retrievedOn`, and re-run the tests. The four
 * models the Normo workbook is built on (GPT-5.1, GPT-5.2, Haiku 4.5, Sonnet 5) are pinned by
 * `lib/llm/__tests__/blend.test.ts` — if a refresh moves one of those, the $6,222.37 baseline
 * moves with it, and that should be a deliberate decision rather than a side effect.
 */

export type LlmModel = {
  /** Stable and hand-assigned — this is what gets persisted as the operator's selection. */
  id: string;
  name: string;
  inputPricePerM: number;
  outputPricePerM: number;
  /** Display-only qualifier: promo windows, tiering, off-peak rates. Never priced. */
  note?: string;
};

export type LlmProvider = {
  id: string;
  name: string;
  /** The pricing page these numbers were read off. */
  source: string;
  /** ISO date the prices were read. Display-only. */
  retrievedOn: string;
  models: readonly LlmModel[];
};

const RETRIEVED_ON = "2026-09-10";

export const LLM_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    source: "https://claude.com/pricing",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "anthropic/fable-5.1", name: "Fable 5.1", inputPricePerM: 10, outputPricePerM: 50 },
      { id: "anthropic/opus-5", name: "Opus 5", inputPricePerM: 5, outputPricePerM: 25 },
      { id: "anthropic/sonnet-5", name: "Sonnet 5", inputPricePerM: 2, outputPricePerM: 10 },
      { id: "anthropic/haiku-4.5", name: "Haiku 4.5", inputPricePerM: 1, outputPricePerM: 5 },
      { id: "anthropic/sonnet-4.6", name: "Sonnet 4.6", inputPricePerM: 3, outputPricePerM: 15, note: "Legacy" },
      { id: "anthropic/opus-4.8", name: "Opus 4.8", inputPricePerM: 5, outputPricePerM: 25, note: "Legacy" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    source: "https://developers.openai.com/api/docs/pricing",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "openai/gpt-6-astra", name: "gpt-6-astra", inputPricePerM: 10, outputPricePerM: 50 },
      { id: "openai/gpt-5.6-sol", name: "gpt-5.6-sol", inputPricePerM: 4, outputPricePerM: 20, note: "Promotional pricing through at least 2026-11-21" },
      { id: "openai/gpt-5.6-terra", name: "gpt-5.6-terra", inputPricePerM: 2, outputPricePerM: 12 },
      { id: "openai/gpt-5.6-luna", name: "gpt-5.6-luna", inputPricePerM: 0.2, outputPricePerM: 1.2 },
      { id: "openai/gpt-5.5", name: "gpt-5.5", inputPricePerM: 5, outputPricePerM: 30 },
      { id: "openai/gpt-5.5-pro", name: "gpt-5.5-pro", inputPricePerM: 30, outputPricePerM: 180 },
      { id: "openai/gpt-5.4", name: "gpt-5.4", inputPricePerM: 2.5, outputPricePerM: 15 },
      { id: "openai/gpt-5.4-pro", name: "gpt-5.4-pro", inputPricePerM: 30, outputPricePerM: 180 },
      { id: "openai/gpt-5.4-mini", name: "gpt-5.4-mini", inputPricePerM: 0.75, outputPricePerM: 4.5 },
      { id: "openai/gpt-5.4-nano", name: "gpt-5.4-nano", inputPricePerM: 0.2, outputPricePerM: 1.25 },
      { id: "openai/gpt-5.2", name: "gpt-5.2", inputPricePerM: 1.75, outputPricePerM: 14, note: "Normo workbook N2" },
      { id: "openai/gpt-5.2-pro", name: "gpt-5.2-pro", inputPricePerM: 21, outputPricePerM: 168 },
      { id: "openai/gpt-5.1", name: "gpt-5.1", inputPricePerM: 1.25, outputPricePerM: 10, note: "Normo workbook N1" },
      { id: "openai/gpt-5", name: "gpt-5", inputPricePerM: 1.25, outputPricePerM: 10 },
      { id: "openai/gpt-5-mini", name: "gpt-5-mini", inputPricePerM: 0.25, outputPricePerM: 2 },
      { id: "openai/gpt-5-nano", name: "gpt-5-nano", inputPricePerM: 0.05, outputPricePerM: 0.4 },
      { id: "openai/gpt-5-pro", name: "gpt-5-pro", inputPricePerM: 15, outputPricePerM: 120 },
      { id: "openai/gpt-5.3-codex", name: "gpt-5.3-codex", inputPricePerM: 1.75, outputPricePerM: 14, note: "Codex, specialized model" },
      { id: "openai/gpt-4.1", name: "gpt-4.1", inputPricePerM: 2, outputPricePerM: 8 },
      { id: "openai/gpt-4.1-mini", name: "gpt-4.1-mini", inputPricePerM: 0.4, outputPricePerM: 1.6 },
      { id: "openai/gpt-4.1-nano", name: "gpt-4.1-nano", inputPricePerM: 0.1, outputPricePerM: 0.4 },
      { id: "openai/gpt-4o", name: "gpt-4o", inputPricePerM: 2.5, outputPricePerM: 10 },
      { id: "openai/gpt-4o-mini", name: "gpt-4o-mini", inputPricePerM: 0.15, outputPricePerM: 0.6 },
      { id: "openai/gpt-4o-2024-05-13", name: "gpt-4o-2024-05-13", inputPricePerM: 5, outputPricePerM: 15, note: "Legacy dated snapshot" },
      { id: "openai/o4-mini", name: "o4-mini", inputPricePerM: 1.1, outputPricePerM: 4.4 },
      { id: "openai/o3", name: "o3", inputPricePerM: 2, outputPricePerM: 8 },
      { id: "openai/o3-mini", name: "o3-mini", inputPricePerM: 1.1, outputPricePerM: 4.4 },
      { id: "openai/o3-pro", name: "o3-pro", inputPricePerM: 20, outputPricePerM: 80 },
      { id: "openai/o1", name: "o1", inputPricePerM: 15, outputPricePerM: 60 },
      { id: "openai/o1-pro", name: "o1-pro", inputPricePerM: 150, outputPricePerM: 600 },
      { id: "openai/gpt-4-turbo-2024-04-09", name: "gpt-4-turbo-2024-04-09", inputPricePerM: 10, outputPricePerM: 30, note: "Legacy" },
      { id: "openai/gpt-4-0613", name: "gpt-4-0613", inputPricePerM: 30, outputPricePerM: 60, note: "Legacy" },
      { id: "openai/gpt-3.5-turbo", name: "gpt-3.5-turbo", inputPricePerM: 0.5, outputPricePerM: 1.5, note: "Legacy" },
      { id: "openai/gpt-3.5-turbo-0125", name: "gpt-3.5-turbo-0125", inputPricePerM: 0.5, outputPricePerM: 1.5, note: "Legacy" },
      { id: "openai/gpt-3.5-turbo-1106", name: "gpt-3.5-turbo-1106", inputPricePerM: 1, outputPricePerM: 2, note: "Legacy" },
      { id: "openai/gpt-3.5-turbo-instruct", name: "gpt-3.5-turbo-instruct", inputPricePerM: 1.5, outputPricePerM: 2, note: "Legacy" },
      { id: "openai/davinci-002", name: "davinci-002", inputPricePerM: 2, outputPricePerM: 2, note: "Legacy" },
      { id: "openai/babbage-002", name: "babbage-002", inputPricePerM: 0.4, outputPricePerM: 0.4, note: "Legacy" },
    ],
  },
  {
    id: "google",
    name: "Google",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "google/gemini-3.8-flash", name: "gemini-3.8-flash", inputPricePerM: 0.75, outputPricePerM: 3.75, note: "Promo through 2026-12-31; 1.50 / 7.50 after" },
      { id: "google/gemini-3.5-flash", name: "gemini-3.5-flash", inputPricePerM: 1.5, outputPricePerM: 9 },
      { id: "google/gemini-3.5-flash-lite", name: "gemini-3.5-flash-lite", inputPricePerM: 0.3, outputPricePerM: 2.5 },
      { id: "google/gemini-3.1-pro-preview", name: "gemini-3.1-pro-preview", inputPricePerM: 2, outputPricePerM: 12, note: "Prompts up to 200k tokens; higher above" },
      { id: "google/gemini-2.5-pro", name: "gemini-2.5-pro", inputPricePerM: 1.25, outputPricePerM: 10, note: "Prompts up to 200k tokens; higher above" },
      { id: "google/gemini-2.5-flash", name: "gemini-2.5-flash", inputPricePerM: 0.3, outputPricePerM: 2.5 },
      { id: "google/gemini-2.5-flash-lite", name: "gemini-2.5-flash-lite", inputPricePerM: 0.1, outputPricePerM: 0.4 },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    source: "https://mistral.ai/pricing/api",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "mistral/medium-3.5", name: "Mistral Medium 3.5", inputPricePerM: 1.5, outputPricePerM: 7.5 },
      { id: "mistral/large-3", name: "Mistral Large 3", inputPricePerM: 0.5, outputPricePerM: 1.5 },
      { id: "mistral/small-4", name: "Mistral Small 4", inputPricePerM: 0.15, outputPricePerM: 0.6 },
      { id: "mistral/ministral-3-8b", name: "Ministral 3 (8B)", inputPricePerM: 0.15, outputPricePerM: 0.15 },
    ],
  },
  {
    id: "cohere",
    name: "Cohere",
    source: "https://cohere.com/pricing",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "cohere/command-r-plus-08-2024", name: "Command R+ 08-2024", inputPricePerM: 2.5, outputPricePerM: 10 },
      { id: "cohere/command-r-03-2024", name: "Command R 03-2024", inputPricePerM: 0.5, outputPricePerM: 1.5 },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    source: "https://api-docs.deepseek.com/quick_start/pricing",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "deepseek/flash", name: "deepseek-flash", inputPricePerM: 0.3, outputPricePerM: 1.2, note: "Peak rate; off-peak is half (0.15 / 0.60)" },
      { id: "deepseek/v4-pro", name: "deepseek-v4-pro", inputPricePerM: 1.32, outputPricePerM: 3.96, note: "Peak rate; off-peak is half. Currently routed to V4.1 Flash and billed at Flash rates" },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    source: "https://docs.x.ai/docs/models",
    retrievedOn: RETRIEVED_ON,
    models: [
      { id: "xai/grok-4.6", name: "grok-4.6", inputPricePerM: 2, outputPricePerM: 6, note: "Under 200k context; doubles above" },
      { id: "xai/grok-4.5", name: "grok-4.5", inputPricePerM: 2, outputPricePerM: 6, note: "Under 200k context; doubles above" },
      { id: "xai/grok-4.3", name: "grok-4.3", inputPricePerM: 1.25, outputPricePerM: 2.5, note: "Under 200k context; doubles above" },
      { id: "xai/grok-build-0.1", name: "grok-build-0.1", inputPricePerM: 1, outputPricePerM: 2, note: "Under 200k context; doubles above" },
    ],
  },
] as const satisfies readonly LlmProvider[];

/** A model plus the provider it came from, so a picker can show both without a second lookup. */
export type ResolvedLlmModel = LlmModel & { provider: LlmProvider };

const BY_ID: ReadonlyMap<string, ResolvedLlmModel> = new Map(
  LLM_PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => [model.id, { ...model, provider }] as const),
  ),
);

export function findLlmModel(id: string): ResolvedLlmModel | undefined {
  return BY_ID.get(id);
}

/** Non-empty tuple, so `z.enum(LLM_MODEL_IDS)` type-checks at the trust boundary. */
export const LLM_MODEL_IDS = [...BY_ID.keys()] as [string, ...string[]];

export const LLM_MODEL_COUNT = BY_ID.size;

/** The Normo workbook's blend: Assumptions!B8 and B9. */
export const DEFAULT_N1_MODEL_ID = "openai/gpt-5.1";
export const DEFAULT_N2_MODEL_ID = "openai/gpt-5.2";
