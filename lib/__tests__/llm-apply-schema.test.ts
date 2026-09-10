import { describe, expect, it } from "vitest";
import { LlmApplySchema } from "@/lib/validation";
import { DEFAULT_N1_MODEL_ID, DEFAULT_N2_MODEL_ID } from "@/lib/llm/models";

const VALID = {
  n1ModelId: DEFAULT_N1_MODEL_ID,
  n2ModelId: DEFAULT_N2_MODEL_ID,
  n1TrafficShare: 0.5,
  estimateId: "3f1a5c8e-2b4d-4f6a-9c1e-8d7b6a5f4e3d",
};

describe("LlmApplySchema", () => {
  it("accepts a well-formed selection", () => {
    expect(LlmApplySchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts the traffic-share endpoints", () => {
    expect(LlmApplySchema.safeParse({ ...VALID, n1TrafficShare: 0 }).success).toBe(true);
    expect(LlmApplySchema.safeParse({ ...VALID, n1TrafficShare: 1 }).success).toBe(true);
  });

  // Catalog membership at the trust boundary, so an unknown id can never reach a lookup that
  // would return undefined.
  it("rejects a model id that is not in the catalog", () => {
    expect(LlmApplySchema.safeParse({ ...VALID, n1ModelId: "openai/gpt-nonexistent" }).success).toBe(false);
    expect(LlmApplySchema.safeParse({ ...VALID, n2ModelId: "" }).success).toBe(false);
  });

  it("rejects a traffic share outside 0-1", () => {
    for (const n1TrafficShare of [1.5, -0.1, 50, Number.NaN]) {
      expect(LlmApplySchema.safeParse({ ...VALID, n1TrafficShare }).success, `${n1TrafficShare}`).toBe(false);
    }
  });

  it("rejects a non-uuid estimate id", () => {
    expect(LlmApplySchema.safeParse({ ...VALID, estimateId: "normo-monthly" }).success).toBe(false);
  });

  it("rejects a missing field rather than defaulting it", () => {
    const { n1TrafficShare, ...withoutShare } = VALID;
    void n1TrafficShare;
    expect(LlmApplySchema.safeParse(withoutShare).success).toBe(false);
  });
});
