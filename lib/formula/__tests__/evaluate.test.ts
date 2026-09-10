import { describe, expect, it } from "vitest";
import { evaluateFormula, type EvaluateFormulaInput } from "@/lib/formula/evaluate";

const PARAMETERS = [
  { key: "price_per_gb", label: "Storage price per GB-month", value: 0.023, unit: "USD/GB/month" },
  { key: "node_hourly", label: "Node hourly rate", value: 2.5, unit: "USD/hour" },
  { key: "hours_per_month", label: "Hours per month", value: 730, unit: "hours" },
  { key: "senior_day_rate", label: "Senior engineer day rate", value: 900, unit: "USD/day" },
  { key: "overhead_rate", label: "Overhead rate", value: 0.15, unit: "ratio" },
  { key: "risk_buffer", label: "Risk buffer", value: 0.1, unit: "ratio" },
  { key: "free_egress_gb", label: "Free egress allowance", value: 100, unit: "GB" },
  { key: "egress_per_gb", label: "Egress price per GB", value: 0.09, unit: "USD/GB" },
  { key: "rps_per_node", label: "Requests/sec per node", value: 500, unit: "rps" },
];

function baseInput(overrides: Partial<EvaluateFormulaInput>): EvaluateFormulaInput {
  return {
    expression: "0",
    lineInputs: {},
    itemInputs: [],
    parameters: PARAMETERS,
    quantity: 1,
    ...overrides,
  };
}

describe("evaluateFormula — plain multiplication", () => {
  it("computes storage_gb * price_per_gb * months", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "storage_gb * price_per_gb * months",
        itemInputs: [
          { key: "storage_gb", label: "Storage (GB)", defaultValue: 1000, unit: "GB" },
          { key: "months", label: "Months", defaultValue: 12, unit: "months" },
        ],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBeCloseTo(1000 * 0.023 * 12, 10);
    expect(result.trace.lineTotal).toBeCloseTo(result.trace.unitPrice * 1, 10);
    expect(result.trace.scope.storage_gb.source).toBe("item_default");
    expect(result.trace.scope.price_per_gb.source).toBe("parameter");
  });
});

describe("evaluateFormula — ceil() over a rate", () => {
  it("computes ceil(peak_rps / rps_per_node) * node_hourly * hours_per_month * months", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "ceil(peak_rps / rps_per_node) * node_hourly * hours_per_month * months",
        itemInputs: [
          { key: "peak_rps", label: "Peak requests/sec", defaultValue: 1001, unit: "rps" },
          { key: "months", label: "Months", defaultValue: 1, unit: "months" },
        ],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ceil(1001 / 500) = ceil(2.002) = 3 nodes, never truncated to 2.
    const expectedNodes = 3;
    expect(result.trace.unitPrice).toBeCloseTo(expectedNodes * 2.5 * 730 * 1, 10);
  });

  it("never rounds the divisor before ceiling — a fractional node count still rounds up", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "ceil(peak_rps / rps_per_node)",
        itemInputs: [{ key: "peak_rps", label: "Peak requests/sec", defaultValue: 500.01, unit: "rps" }],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBe(2);
  });
});

describe("evaluateFormula — ternary with a free tier", () => {
  it("returns 0 when usage is within the free tier", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "data_egress_gb > free_egress_gb ? (data_egress_gb - free_egress_gb) * egress_per_gb : 0",
        itemInputs: [{ key: "data_egress_gb", label: "Egress (GB)", defaultValue: 50, unit: "GB" }],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBe(0);
  });

  it("charges only the overage above the free tier", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "data_egress_gb > free_egress_gb ? (data_egress_gb - free_egress_gb) * egress_per_gb : 0",
        itemInputs: [{ key: "data_egress_gb", label: "Egress (GB)", defaultValue: 150, unit: "GB" }],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBeCloseTo((150 - 100) * 0.09, 10);
  });
});

describe("evaluateFormula — nested percentage uplift", () => {
  it("computes dev_days * senior_day_rate * (1 + overhead_rate) * (1 + risk_buffer)", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "dev_days * senior_day_rate * (1 + overhead_rate) * (1 + risk_buffer)",
        itemInputs: [{ key: "dev_days", label: "Developer days", defaultValue: 20, unit: "days" }],
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBeCloseTo(20 * 900 * 1.15 * 1.1, 10);
  });
});

describe("evaluateFormula — scope resolution order", () => {
  const expression = "storage_gb * price_per_gb";
  const itemInputs = [{ key: "storage_gb", label: "Storage (GB)", defaultValue: 100, unit: "GB" }];

  it("uses the parameter value when no item input or line input exists for a key", () => {
    const result = evaluateFormula(
      baseInput({ expression: "price_per_gb", itemInputs: [], lineInputs: {} })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.scope.price_per_gb).toEqual({
      value: 0.023,
      label: "Storage price per GB-month",
      unit: "USD/GB/month",
      source: "parameter",
    });
  });

  it("prefers the item input default over there being no value at all", () => {
    const result = evaluateFormula(baseInput({ expression, itemInputs, lineInputs: {} }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.scope.storage_gb).toMatchObject({ value: 100, source: "item_default" });
  });

  it("prefers the line input value over the item input default", () => {
    const result = evaluateFormula(
      baseInput({ expression, itemInputs, lineInputs: { storage_gb: 5000 } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.scope.storage_gb).toMatchObject({ value: 5000, source: "line_input" });
    expect(result.trace.unitPrice).toBeCloseTo(5000 * 0.023, 10);
  });
});

describe("evaluateFormula — error paths", () => {
  it("reports an unknown_identifier error and never coerces to zero", () => {
    const result = evaluateFormula(baseInput({ expression: "storage_gb * price_per_gb" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unknown_identifier");
    expect(result.token).toBe("storage_gb");
  });

  it("reports division_by_zero rather than Infinity", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "storage_gb / zero_rate",
        itemInputs: [
          { key: "storage_gb", label: "Storage", defaultValue: 10, unit: "GB" },
          { key: "zero_rate", label: "Zero rate", defaultValue: 0, unit: "x" },
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("division_by_zero");
  });

  it("reports non_finite for NaN-producing expressions", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "sqrt(negative_value)",
        itemInputs: [{ key: "negative_value", label: "Negative", defaultValue: -4, unit: "x" }],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("non_finite");
  });

  it("reports a disallowed_function error for functions outside the allowlist", () => {
    const result = evaluateFormula(baseInput({ expression: "atan2(1, 2)" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("disallowed_function");
    expect(result.token).toBe("atan2");
  });

  it("rejects expr-eval's other built-ins too (map/fold/filter/random/fac)", () => {
    for (const expression of ["map(x, f)", "random()", "fac(5)"]) {
      const result = evaluateFormula(baseInput({ expression }));
      expect(result.ok).toBe(false);
    }
  });

  it("reports a syntax error for malformed expressions", () => {
    const result = evaluateFormula(baseInput({ expression: "storage_gb * (price_per_gb" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("syntax");
  });

  it("rejects assignment as a syntax/disallowed construct, never mutating scope", () => {
    const result = evaluateFormula(baseInput({ expression: "x = 5" }));
    expect(result.ok).toBe(false);
  });
});

describe("evaluateFormula — qty reserved identifier", () => {
  it("resolves qty to the line quantity and applies it after unitPrice, not inside scope", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "price_per_gb * qty",
        quantity: 4,
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.scope.qty).toBeUndefined();
    expect(result.trace.unitPrice).toBeCloseTo(0.023 * 4, 10);
    expect(result.trace.quantity).toBe(4);
    expect(result.trace.lineTotal).toBeCloseTo(result.trace.unitPrice * 4, 10);
  });

  it("applies quantity as a separate step even for formulas that don't reference qty", () => {
    const result = evaluateFormula(baseInput({ expression: "price_per_gb", quantity: 3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBeCloseTo(0.023, 10);
    expect(result.trace.lineTotal).toBeCloseTo(0.023 * 3, 10);
  });

  it("treats qty as reserved: an item input or parameter named qty collides", () => {
    const result = evaluateFormula(
      baseInput({
        expression: "qty * price_per_gb",
        itemInputs: [{ key: "qty", label: "Bogus qty input", defaultValue: 99, unit: "x" }],
        quantity: 2,
      })
    );
    // qty must resolve to the line quantity (2), never to the item input
    // default (99), since qty is reserved and skipped during scope
    // resolution entirely.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trace.unitPrice).toBeCloseTo(2 * 0.023, 10);
  });
});
