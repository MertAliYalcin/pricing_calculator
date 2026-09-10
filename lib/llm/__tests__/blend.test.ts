import { describe, expect, it } from "vitest";
import { validateFormulaSyntax } from "@/lib/formula";
import {
  BLENDED_LLM_COST_FORMULA,
  LLM_SELECTION_PARAMETER_KEYS,
  LLM_TOKEN_SHAPE_PARAMETER_KEYS,
  evaluateBlendedCostPerQuery,
  selectionParameterValues,
  type LlmSelection,
} from "@/lib/llm/blend";
import {
  DEFAULT_N1_MODEL_ID,
  DEFAULT_N2_MODEL_ID,
  LLM_MODEL_IDS,
  LLM_PROVIDERS,
  findLlmModel,
} from "@/lib/llm/models";

/** The workbook's token shape (Assumptions!B40:B41), at the 6dp `numeric(18,6)` can hold. */
const TOKENS = { inputTokensPerQuery: 71428.571429, outputTokensPerQuery: 11904.761905 };

function model(id: string) {
  const m = findLlmModel(id);
  if (!m) throw new Error(`fixture references unknown model ${id}`);
  return m;
}

function selection(n1Id: string, n2Id: string, n1TrafficShare = 0.5): LlmSelection {
  return { n1: model(n1Id), n2: model(n2Id), n1TrafficShare };
}

function unitPrice(s: LlmSelection) {
  const result = evaluateBlendedCostPerQuery(s, TOKENS);
  if (!result.ok) throw new Error(`expected a priced blend, got: ${result.message}`);
  return result.trace.unitPrice;
}

describe("BLENDED_LLM_COST_FORMULA", () => {
  it("is valid syntax the engine accepts", () => {
    expect(validateFormulaSyntax(BLENDED_LLM_COST_FORMULA).ok).toBe(true);
  });

  // The guard that keeps the constant and the seeded parameter set in lockstep: if someone edits
  // the formula to reference a key the seed does not create, this fails rather than the app.
  it("references exactly the selection keys plus the two token anchors", () => {
    const syntax = validateFormulaSyntax(BLENDED_LLM_COST_FORMULA);
    if (!syntax.ok) throw new Error(syntax.message);

    expect([...syntax.identifiers].sort()).toEqual(
      [...LLM_SELECTION_PARAMETER_KEYS, ...LLM_TOKEN_SHAPE_PARAMETER_KEYS].sort(),
    );
  });
});

describe("evaluateBlendedCostPerQuery", () => {
  it("reproduces the workbook's $0.25 GPT-5.1/GPT-5.2 blend (Assumptions!B20)", () => {
    // Not toBe(0.25): the token anchors are 6dp, so the exact value is 0.2500000000035.
    expect(unitPrice(selection(DEFAULT_N1_MODEL_ID, DEFAULT_N2_MODEL_ID))).toBeCloseTo(0.25, 9);
  });

  it("reproduces the workbook's Haiku/Sonnet 5 blend (Assumptions!B48)", () => {
    expect(unitPrice(selection("anthropic/haiku-4.5", "anthropic/sonnet-5"))).toBeCloseTo(0.196429, 6);
  });

  it("reproduces the workbook's Haiku-only blend (Assumptions!B31) at a 100% N1 share", () => {
    expect(unitPrice(selection("anthropic/haiku-4.5", "anthropic/sonnet-5", 1))).toBeCloseTo(0.130952, 6);
  });

  // Catches an inverted `(1 - share)`, which a 50/50 default would hide entirely.
  it("collapses to N2 alone at a 0% N1 share", () => {
    expect(unitPrice(selection("anthropic/haiku-4.5", "anthropic/sonnet-5", 0))).toBeCloseTo(0.261905, 6);
  });

  it("is monotonic in the traffic share when N1 is cheaper than N2", () => {
    const cheapN1 = (share: number) => unitPrice(selection("anthropic/haiku-4.5", "anthropic/sonnet-5", share));
    expect(cheapN1(0.25)).toBeGreaterThan(cheapN1(0.75));
  });

  // The trace is the product feature (CLAUDE.md rule 3), not a debug afterthought — assert it.
  it("returns a trace naming the chosen models", () => {
    const result = evaluateBlendedCostPerQuery(selection("anthropic/haiku-4.5", "anthropic/sonnet-5"), TOKENS);
    if (!result.ok) throw new Error(result.message);

    const scope = result.trace.scope;
    expect(Object.keys(scope)).toHaveLength(7);
    expect(Object.values(scope).every((entry) => entry.source === "parameter")).toBe(true);
    expect(scope.n1_input_price_per_1m_tokens.label).toContain("Haiku 4.5");
    expect(scope.n2_output_price_per_1m_tokens.label).toContain("Sonnet 5");
    expect(result.trace.expression).toBe(BLENDED_LLM_COST_FORMULA);
  });
});

describe("selectionParameterValues", () => {
  it("returns exactly the selection keys, already at persistence precision", () => {
    const values = selectionParameterValues(selection("anthropic/haiku-4.5", "anthropic/sonnet-5", 0.5));

    expect(Object.keys(values).sort()).toEqual([...LLM_SELECTION_PARAMETER_KEYS].sort());
    for (const value of Object.values(values)) {
      expect(value).toBe(Math.round(value * 1_000_000) / 1_000_000);
    }
  });

  it("maps N1 and N2 to their own sides of the blend", () => {
    const values = selectionParameterValues(selection("anthropic/haiku-4.5", "anthropic/sonnet-5", 0.4));

    expect(values.n1_input_price_per_1m_tokens).toBe(1);
    expect(values.n1_output_price_per_1m_tokens).toBe(5);
    expect(values.n2_input_price_per_1m_tokens).toBe(2);
    expect(values.n2_output_price_per_1m_tokens).toBe(10);
    expect(values.n1_traffic_share).toBe(0.4);
  });
});

describe("the model catalog", () => {
  // The parity pin. A price refresh that moves one of these moves the $6,222.37 Normo baseline
  // with it — that should be a deliberate decision, not a silent side effect of editing models.ts.
  it("pins the four models the Normo workbook is built on", () => {
    expect(findLlmModel("openai/gpt-5.1")).toMatchObject({ inputPricePerM: 1.25, outputPricePerM: 10 });
    expect(findLlmModel("openai/gpt-5.2")).toMatchObject({ inputPricePerM: 1.75, outputPricePerM: 14 });
    expect(findLlmModel("anthropic/haiku-4.5")).toMatchObject({ inputPricePerM: 1, outputPricePerM: 5 });
    expect(findLlmModel("anthropic/sonnet-5")).toMatchObject({ inputPricePerM: 2, outputPricePerM: 10 });
  });

  it("has unique model ids", () => {
    expect(new Set(LLM_MODEL_IDS).size).toBe(LLM_MODEL_IDS.length);
  });

  it("resolves the seeded defaults", () => {
    expect(findLlmModel(DEFAULT_N1_MODEL_ID)).toBeDefined();
    expect(findLlmModel(DEFAULT_N2_MODEL_ID)).toBeDefined();
  });

  it("returns undefined for an unknown id rather than throwing", () => {
    expect(findLlmModel("openai/does-not-exist")).toBeUndefined();
  });

  // Every displayed price must be auditable against a dated source (SPEC.md §2, §4.6).
  it("cites a source and a retrieval date for every provider", () => {
    expect(LLM_PROVIDERS.length).toBeGreaterThan(0);

    for (const provider of LLM_PROVIDERS) {
      expect(provider.models.length, provider.id).toBeGreaterThan(0);
      expect(provider.source, provider.id).toMatch(/^https:\/\//);
      expect(provider.retrievedOn, provider.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("prices every model positively on both sides", () => {
    for (const provider of LLM_PROVIDERS) {
      for (const m of provider.models) {
        expect(m.inputPricePerM, m.id).toBeGreaterThan(0);
        expect(m.outputPricePerM, m.id).toBeGreaterThan(0);
      }
    }
  });

  it("attributes each resolved model to its provider", () => {
    expect(findLlmModel("openai/gpt-5.1")?.provider.name).toBe("OpenAI");
    expect(findLlmModel("anthropic/haiku-4.5")?.provider.name).toBe("Anthropic");
  });
});
