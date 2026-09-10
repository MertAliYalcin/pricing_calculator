import { describe, expect, it } from "vitest";
import { validateFormulaSyntax } from "@/lib/formula/parse";

describe("validateFormulaSyntax", () => {
  it("extracts free identifiers and excludes qty", () => {
    const result = validateFormulaSyntax("storage_gb * price_per_gb * qty");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identifiers.sort()).toEqual(["price_per_gb", "storage_gb"]);
  });

  it("does not treat allowlisted function names as identifiers", () => {
    const result = validateFormulaSyntax("ceil(peak_rps / rps_per_node) * node_hourly");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identifiers.sort()).toEqual(["node_hourly", "peak_rps", "rps_per_node"]);
  });

  it("flags a disallowed function with its token and position", () => {
    const result = validateFormulaSyntax("hypot(a, b)");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("disallowed_function");
    expect(result.token).toBe("hypot");
    expect(result.position).toBe(0);
  });

  it("flags a syntax error for unbalanced parentheses", () => {
    const result = validateFormulaSyntax("a * (b + c");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("syntax");
  });

  it("flags an empty formula as a syntax error", () => {
    const result = validateFormulaSyntax("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("syntax");
  });

  it("rejects string literals", () => {
    const result = validateFormulaSyntax('a + "oops"');
    expect(result.ok).toBe(false);
  });

  it("rejects array literals", () => {
    const result = validateFormulaSyntax("a + [1, 2, 3]");
    expect(result.ok).toBe(false);
  });

  it("rejects user-defined functions", () => {
    const result = validateFormulaSyntax("f(x) = x * 2; f(a)");
    expect(result.ok).toBe(false);
  });

  it("accepts comparison and ternary operators", () => {
    const result = validateFormulaSyntax("a > b ? a : b");
    expect(result.ok).toBe(true);
  });
});
