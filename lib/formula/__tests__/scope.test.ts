import { describe, expect, it } from "vitest";
import { checkKeyCollision, resolveScope } from "@/lib/formula/scope";

describe("resolveScope", () => {
  const itemInputs = [{ key: "storage_gb", label: "Storage (GB)", defaultValue: 100, unit: "GB" }];
  const parameters = [
    { key: "price_per_gb", label: "Price per GB", value: 0.02, unit: "USD/GB" },
  ];

  it("resolves in order: line input > item default > parameter", () => {
    const withLineInput = resolveScope(
      ["storage_gb", "price_per_gb"],
      { storage_gb: 999 },
      itemInputs,
      parameters
    );
    expect(withLineInput.ok).toBe(true);
    if (!withLineInput.ok) return;
    expect(withLineInput.scope.storage_gb).toMatchObject({ value: 999, source: "line_input" });
    expect(withLineInput.scope.price_per_gb).toMatchObject({ value: 0.02, source: "parameter" });
  });

  it("falls back to the item default when there is no line input", () => {
    const result = resolveScope(["storage_gb"], {}, itemInputs, parameters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scope.storage_gb).toMatchObject({ value: 100, source: "item_default" });
  });

  it("falls back to the parameter when there is neither a line input nor an item input", () => {
    const result = resolveScope(["price_per_gb"], {}, [], parameters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scope.price_per_gb).toMatchObject({ value: 0.02, source: "parameter" });
  });

  it("skips qty entirely — it is never part of the resolved scope", () => {
    const result = resolveScope(["qty", "price_per_gb"], {}, [], parameters);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scope.qty).toBeUndefined();
    expect(Object.keys(result.scope)).toEqual(["price_per_gb"]);
  });

  it("returns an unknown_identifier error naming the first unresolvable identifier", () => {
    const result = resolveScope(["storage_gb", "mystery_key"], {}, itemInputs, parameters);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unknown_identifier");
    expect(result.token).toBe("mystery_key");
  });
});

describe("checkKeyCollision", () => {
  it("allows a fresh key that collides with nothing", () => {
    expect(checkKeyCollision("new_key", ["existing_input"], ["existing_param"])).toEqual({
      ok: true,
    });
  });

  it("rejects an item input key that matches an existing parameter key", () => {
    const result = checkKeyCollision("price_per_gb", [], ["price_per_gb"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("collision");
    expect(result.key).toBe("price_per_gb");
  });

  it("rejects a parameter key that matches an existing item input key", () => {
    const result = checkKeyCollision("storage_gb", ["storage_gb"], []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("collision");
  });

  it("rejects qty as a candidate key", () => {
    const result = checkKeyCollision("qty", [], []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("collision");
    expect(result.key).toBe("qty");
  });
});
