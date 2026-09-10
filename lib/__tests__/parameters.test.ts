import { describe, expect, it } from "vitest";
import { resolveParameterGraph, type RawParameter } from "@/lib/parameters/graph";

function param(overrides: Partial<RawParameter> & { key: string }): RawParameter {
  return { label: overrides.key, value: 0, unit: null, formula: null, ...overrides };
}

describe("resolveParameterGraph", () => {
  it("passes through a literal parameter unchanged", () => {
    const [result] = resolveParameterGraph([param({ key: "senior_day_rate", value: 850 })]);
    expect(result).toEqual({
      id: undefined,
      key: "senior_day_rate",
      label: "senior_day_rate",
      unit: null,
      value: 850,
      formula: null,
      editable: false,
      error: null,
    });
  });

  it("carries the editable flag through for literal parameters, defaulting formula parameters to non-editable", () => {
    const raw = [
      param({ id: "p1", key: "months", value: 6, editable: true }),
      param({ key: "loaded", formula: "months * 2" }),
    ];
    const resolved = resolveParameterGraph(raw);
    expect(resolved.find((r) => r.key === "months")).toMatchObject({ id: "p1", editable: true });
    expect(resolved.find((r) => r.key === "loaded")).toMatchObject({ editable: false });
  });

  it("evaluates a formula parameter against another parameter", () => {
    const raw = [
      param({ key: "senior_day_rate", value: 850 }),
      param({ key: "overhead_rate", value: 0.2 }),
      param({ key: "senior_day_rate_loaded", formula: "senior_day_rate * (1 + overhead_rate)" }),
    ];
    const resolved = resolveParameterGraph(raw);
    const loaded = resolved.find((r) => r.key === "senior_day_rate_loaded")!;
    expect(loaded.error).toBeNull();
    expect(loaded.value).toBeCloseTo(1020);
  });

  it("chains through multiple levels of formula parameters", () => {
    const raw = [
      param({ key: "a", value: 10 }),
      param({ key: "b", formula: "a * 2" }),
      param({ key: "c", formula: "b * 2" }),
    ];
    const resolved = resolveParameterGraph(raw);
    expect(resolved.find((r) => r.key === "c")!.value).toBe(40);
  });

  it("reports a circular reference as an error, not a crash or a zero", () => {
    const raw = [param({ key: "a", formula: "b + 1" }), param({ key: "b", formula: "a + 1" })];
    const resolved = resolveParameterGraph(raw);
    for (const r of resolved) {
      expect(r.error).toMatch(/circular/i);
      expect(Number.isNaN(r.value)).toBe(true);
    }
  });

  it("reports an unknown identifier as an error", () => {
    const [result] = resolveParameterGraph([param({ key: "a", formula: "does_not_exist * 2" })]);
    expect(result.error).toMatch(/unknown identifier/i);
    expect(Number.isNaN(result.value)).toBe(true);
  });

  it("propagates a dependency's error without re-deriving it", () => {
    const raw = [
      param({ key: "a", formula: "missing_key" }),
      param({ key: "b", formula: "a * 2" }),
    ];
    const resolved = resolveParameterGraph(raw);
    expect(resolved.find((r) => r.key === "b")!.error).toBeTruthy();
    expect(Number.isNaN(resolved.find((r) => r.key === "b")!.value)).toBe(true);
  });
});
