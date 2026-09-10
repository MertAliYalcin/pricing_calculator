import { describe, expect, it } from "vitest";
import { resolveParameterGraph, type RawParameter } from "@/lib/parameters/graph";
import { PARAMETERS } from "@/prisma/seed";

/**
 * The seeded parameter set, resolved as a graph. Importing `PARAMETERS` straight from the seed is
 * safe — `main()` there is guarded by an `argv[1]` check, so nothing touches the database.
 *
 * The point of this suite is that the *real* parameter set is the fixture. Hand-written fixtures
 * would keep passing while the shipped seed was broken.
 */
function seededParameters(): RawParameter[] {
  return PARAMETERS.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.value,
    unit: p.unit ?? null,
    formula: "formula" in p ? p.formula : null,
    editable: "editable" in p ? p.editable : false,
  }));
}

function byKey(raw: RawParameter[] = seededParameters()) {
  return new Map(resolveParameterGraph(raw).map((r) => [r.key, r]));
}

describe("the seeded parameter graph", () => {
  // The most valuable assertion in the feature: it fails the moment anyone reintroduces the
  // token-shape cycle by pointing implied_output_tokens_per_query back at the live blend.
  it("resolves every parameter without an error", () => {
    const failed = resolveParameterGraph(seededParameters())
      .filter((r) => r.error)
      .map((r) => `${r.key}: ${r.error}`);

    expect(failed).toEqual([]);
  });

  it("gives every parameter a finite value", () => {
    for (const p of resolveParameterGraph(seededParameters())) {
      expect(Number.isFinite(p.value), p.key).toBe(true);
    }
  });

  it("reproduces the workbook's derived figures", () => {
    const params = byKey();

    expect(params.get("monthly_incoming_queries")!.value).toBe(20000);
    expect(params.get("blended_llm_cost_per_query")!.value).toBeCloseTo(0.25, 9);
    // 6 x the 6dp anchor, so ...57143 rather than the workbook's full-precision ...5714286.
    expect(params.get("input_tokens_per_query")!.value).toBeCloseTo(71428.57143, 6);
    expect(params.get("output_tokens_per_query")!.value).toBeCloseTo(11904.761905, 6);
  });

  it("keeps the workbook's B40/B41/B42 checks agreeing with the anchors they document", () => {
    const params = byKey();

    // B42: the recomputed GPT blend must still equal the target the shape was solved for.
    expect(params.get("recomputed_blended_gpt_cost_per_query")!.value).toBeCloseTo(0.25, 9);
    expect(params.get("target_blended_llm_cost_per_query")!.value).toBe(0.25);

    // B40/B41: the original derivation must still land on the promoted anchors' values.
    expect(params.get("implied_output_tokens_per_query")!.value).toBeCloseTo(11904.761905, 6);
    expect(params.get("implied_input_tokens_per_query")!.value).toBeCloseTo(71428.571429, 6);
  });

  it("keeps the workbook's alternative blends (B31, B48) intact", () => {
    const params = byKey();

    expect(params.get("blended_haiku_cost_per_query")!.value).toBeCloseTo(0.130952, 6);
    expect(params.get("blended_cost_per_query_haiku_sonnet")!.value).toBeCloseTo(0.196429, 6);
  });

  it("marks the model-selection parameters editable literals, not formulas", () => {
    const params = byKey();

    for (const key of [
      "n1_traffic_share",
      "n1_input_price_per_1m_tokens",
      "n1_output_price_per_1m_tokens",
      "n2_input_price_per_1m_tokens",
      "n2_output_price_per_1m_tokens",
      "output_tokens_per_query",
    ]) {
      expect(params.get(key)!.formula, key).toBeNull();
      expect(params.get(key)!.editable, key).toBe(true);
    }
  });

  it("propagates a model-price change into the blend", () => {
    const raw = seededParameters();
    // Swap N1 to Haiku 4.5's prices (1 / 5); N2 stays GPT-5.2.
    raw.find((p) => p.key === "n1_input_price_per_1m_tokens")!.value = 1;
    raw.find((p) => p.key === "n1_output_price_per_1m_tokens")!.value = 5;

    const blend = byKey(raw).get("blended_llm_cost_per_query")!;
    expect(blend.error).toBeNull();
    // 0.5 * 0.130952 + 0.5 * 0.291667
    expect(blend.value).toBeCloseTo(0.211310, 5);
  });

  it("propagates a traffic-split change into the blend", () => {
    const raw = seededParameters();
    raw.find((p) => p.key === "n1_traffic_share")!.value = 1;

    // 100% N1 = GPT-5.1 alone.
    expect(byKey(raw).get("blended_llm_cost_per_query")!.value).toBeCloseTo(0.208333, 6);
  });

  // Proves the cycle was removed from the data, not that cycle detection was lost. This patch
  // recreates exactly the loop the promotion of the token shape broke: the blend prices off the
  // token anchor, so deriving that anchor back off the blend closes the ring.
  it("still detects a cycle if the token anchor is derived back off the live blend", () => {
    const raw = seededParameters();
    const anchor = raw.find((p) => p.key === "output_tokens_per_query")!;
    anchor.formula = "(blended_llm_cost_per_query * 1000000) / 21";

    const blend = byKey(raw).get("blended_llm_cost_per_query")!;
    expect(blend.error).toBeTruthy();
    expect(blend.error).toMatch(/[Cc]ircular/);
  });

  it("has no duplicate keys", () => {
    const keys = PARAMETERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
