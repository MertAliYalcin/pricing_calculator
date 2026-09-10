import { describe, expect, it } from "vitest";
import { repriceLines, type RepriceLine } from "@/lib/reprice";
import { roundForPersistence } from "@/lib/money";
import type { RawParameter } from "@/lib/parameters/graph";
import { selectionParameterValues, type LlmSelection } from "@/lib/llm/blend";
import { findLlmModel } from "@/lib/llm/models";
import { PARAMETERS, ITEMS, CATEGORIES } from "@/prisma/seed";

/** The total the workbook produces and the seed persists. */
const BASELINE_TOTAL = 6222.36998;

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

/** The nine seeded catalog items as estimate lines, at qty 1 with their input defaults. */
function seededLines(): RepriceLine[] {
  const categoryName = new Map(CATEGORIES.map((c) => [c.slug, c.name]));

  return ITEMS.map((item, i) => ({
    id: `line-${i}`,
    itemName: item.name,
    categoryName: categoryName.get(item.categorySlug)!,
    formula: item.formula,
    quantity: 1,
    inputValues: {},
    itemInputs: item.inputs.map((inp) => ({
      key: inp.key,
      label: inp.label,
      defaultValue: inp.defaultValue,
      unit: inp.unit ?? null,
    })),
  }));
}

function selection(n1Id: string, n2Id: string, n1TrafficShare = 0.5): LlmSelection {
  return { n1: findLlmModel(n1Id)!, n2: findLlmModel(n2Id)!, n1TrafficShare };
}

function repriceSeeded(overrides?: Record<string, number>) {
  return repriceLines({ lines: seededLines(), parameters: seededParameters(), overrides });
}

describe("repriceLines against the seeded Normo catalog", () => {
  // The parity assertion the whole token-shape change hangs on: with the workbook's models,
  // repricing from scratch must land on the number already in the database.
  it("reproduces the baseline monthly total with no overrides", () => {
    const result = repriceSeeded();

    expect(result.parameterErrors).toEqual([]);
    expect(result.hasErrors).toBe(false);
    expect(result.lines).toHaveLength(9);
    expect(roundForPersistence(result.total)).toBe(BASELINE_TOTAL);
  });

  it("prices the LLM inference line at the workbook's $5,000", () => {
    const line = repriceSeeded().lines.find((l) => l.itemName.startsWith("LLM Inference"))!;

    expect(line.ok).toBe(true);
    if (!line.ok) return;
    expect(line.trace.lineTotal).toBeCloseTo(5000, 4);
  });

  it("reprices to the Haiku 4.5 / Sonnet 5 blend", () => {
    const result = repriceSeeded(selectionParameterValues(selection("anthropic/haiku-4.5", "anthropic/sonnet-5")));

    expect(result.hasErrors).toBe(false);
    // 20,000 queries x (0.19642857… - 0.25). Only the LLM line moves, so the delta is exactly
    // the change in blended cost per query times the monthly query volume.
    expect(result.total - BASELINE_TOTAL).toBeCloseTo(-1071.428571, 4);
    expect(roundForPersistence(result.total)).toBeCloseTo(5150.94, 2);
  });

  it("leaves every non-LLM line untouched when the model changes", () => {
    const before = repriceSeeded();
    const after = repriceSeeded(selectionParameterValues(selection("anthropic/haiku-4.5", "anthropic/sonnet-5")));

    for (const [i, line] of after.lines.entries()) {
      if (line.itemName.startsWith("LLM Inference")) continue;
      const previous = before.lines[i];
      if (!line.ok || !previous.ok) throw new Error(`line ${line.itemName} failed to price`);
      expect(line.trace.lineTotal, line.itemName).toBe(previous.trace.lineTotal);
    }
  });

  it("honours the traffic share, so a 100% N1 split ignores N2 entirely", () => {
    const viaN2 = repriceSeeded(selectionParameterValues(selection("anthropic/haiku-4.5", "anthropic/sonnet-5", 1)));
    const otherN2 = repriceSeeded(selectionParameterValues(selection("anthropic/haiku-4.5", "openai/gpt-6-astra", 1)));

    expect(viaN2.total).toBe(otherN2.total);
  });
});

describe("repriceLines override handling", () => {
  it("rejects an override aimed at a formula parameter, and does not apply it", () => {
    const result = repriceSeeded({ blended_llm_cost_per_query: 999 });

    expect(result.rejectedOverrides).toEqual([
      { key: "blended_llm_cost_per_query", reason: "formula_parameter" },
    ]);
    expect(roundForPersistence(result.total)).toBe(BASELINE_TOTAL);
  });

  it("rejects an override for a key that does not exist", () => {
    const result = repriceSeeded({ no_such_parameter: 1 });

    expect(result.rejectedOverrides).toEqual([{ key: "no_such_parameter", reason: "unknown" }]);
    expect(roundForPersistence(result.total)).toBe(BASELINE_TOTAL);
  });

  it("does not mutate the caller's parameter array", () => {
    const parameters = seededParameters();
    repriceLines({ lines: seededLines(), parameters, overrides: { n1_input_price_per_1m_tokens: 99 } });

    expect(parameters.find((p) => p.key === "n1_input_price_per_1m_tokens")!.value).toBe(1.25);
  });
});

describe("repriceLines failure handling", () => {
  const parameters: RawParameter[] = [
    { key: "rate", label: "Rate", value: 10, unit: null, formula: null, editable: true },
  ];

  function line(overrides: Partial<RepriceLine>): RepriceLine {
    return {
      id: "l1",
      itemName: "Thing",
      categoryName: "Cat",
      formula: "rate",
      quantity: 1,
      inputValues: {},
      itemInputs: [],
      ...overrides,
    };
  }

  it("excludes an errored line from the total instead of counting it as zero", () => {
    const result = repriceLines({
      lines: [line({ id: "good" }), line({ id: "bad", formula: "rate * mystery_key" })],
      parameters,
    });

    expect(result.hasErrors).toBe(true);
    expect(result.lines.find((l) => l.id === "bad")!.ok).toBe(false);
    expect(result.total).toBe(10);
  });

  it("names the offending identifier rather than reporting a non-finite result", () => {
    const result = repriceLines({ lines: [line({ formula: "mystery_key" })], parameters });
    const [only] = result.lines;

    expect(only.ok).toBe(false);
    if (only.ok) return;
    expect(only.message).toContain("mystery_key");
  });

  it("reports a broken parameter formula and fails only its dependents", () => {
    const result = repriceLines({
      lines: [line({ id: "independent", formula: "rate" }), line({ id: "dependent", formula: "broken" })],
      parameters: [
        ...parameters,
        { key: "broken", label: "Broken", value: 0, unit: null, formula: "rate * nope", editable: false },
      ],
    });

    expect(result.parameterErrors.map((e) => e.key)).toEqual(["broken"]);
    expect(result.lines.find((l) => l.id === "independent")!.ok).toBe(true);
    expect(result.lines.find((l) => l.id === "dependent")!.ok).toBe(false);
    expect(result.total).toBe(10);
    expect(Number.isFinite(result.total)).toBe(true);
  });

  it("surfaces a division by zero rather than an Infinity total", () => {
    const result = repriceLines({
      lines: [line({ formula: "rate / zero" })],
      parameters: [...parameters, { key: "zero", label: "Zero", value: 0, unit: null, formula: null, editable: true }],
    });

    expect(result.lines[0].ok).toBe(false);
    expect(result.total).toBe(0);
  });
});

describe("repriceLines scope resolution", () => {
  const parameters: RawParameter[] = [
    { key: "rate", label: "Rate", value: 10, unit: null, formula: null, editable: true },
  ];

  const base: RepriceLine = {
    id: "l1",
    itemName: "Thing",
    categoryName: "Cat",
    formula: "rate * hours",
    quantity: 1,
    inputValues: {},
    itemInputs: [{ key: "hours", label: "Hours", defaultValue: 3, unit: "h" }],
  };

  it("prices off an item input's default when no line value is given", () => {
    const result = repriceLines({ lines: [base], parameters });
    expect(result.total).toBe(30);
  });

  it("lets a line input override the item default (SPEC 5.3 order)", () => {
    const result = repriceLines({ lines: [{ ...base, inputValues: { hours: 5 } }], parameters });
    expect(result.total).toBe(50);
  });

  it("multiplies through the line quantity", () => {
    const result = repriceLines({ lines: [{ ...base, quantity: 4 }], parameters });
    expect(result.total).toBe(120);
  });

  it("drops itemInputs from the returned line but keeps the trace", () => {
    const [only] = repriceLines({ lines: [base], parameters }).lines;

    expect("itemInputs" in only).toBe(false);
    if (!only.ok) throw new Error(only.message);
    expect(only.trace.scope.hours.source).toBe("item_default");
    expect(only.trace.scope.rate.source).toBe("parameter");
  });
});
