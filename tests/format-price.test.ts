// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { formatPrice, formatPriceVariants } from "../src/client/lib/format.js";
import fxRates from "./fixtures/fx-rates.json";

describe("formatPrice", () => {
  it("uses fiat-aware precision", () => {
    expect(formatPrice("104250.42", "USD")).toContain("104,250.42");
    expect(formatPrice("167000000", "ARS")).toContain("167,000,000");
    expect(formatPrice("16700000", "JPY")).not.toContain(".00");
    expect(formatPrice("12.3456", "KWD")).toContain("12.346");
    expect(formatPrice("12.3456", "BHD")).toContain("12.346");
  });

  it("keeps an exact accessible value and creates a compact constrained value", () => {
    // Use a stable two-decimal currency: IDR precision differs across ICU versions.
    const largeUsd = formatPriceVariants("141998081600.71", "USD");
    const irr = formatPriceVariants("4375000000", "IRR");

    expect(largeUsd.exact).toContain("141,998,081,600.71");
    expect(largeUsd.compact).toMatch(/142B/);
    expect(largeUsd.length).toBe("extra-long");
    expect(irr.exact).toContain("4,375,000,000");
    expect(irr.compact).toMatch(/4\.38B/);
  });

  it("classifies common values without forcing compact notation", () => {
    const usd = formatPriceVariants("104250.42", "USD");
    const jpy = formatPriceVariants("16700000", "JPY");

    expect(usd.exact).toContain("104,250.42");
    expect(usd.compact).toMatch(/104K/);
    expect(usd.length).toBe("medium");
    expect(jpy.exact).not.toContain(".00");
  });

  it("formats every currency in the recorded FX matrix safely", () => {
    // Fixed public FX sample keeps formatting coverage independent of runtime data.
    for (const [currency, rate] of Object.entries(fxRates)) {
      const result = formatPriceVariants(String(90_420.42 * rate), currency);
      expect(result.exact, currency).not.toBe("—");
      expect(result.compact, currency).not.toBe("—");
      expect(result.exact, currency).not.toMatch(/NaN|Infinity/);
      expect(["short", "medium", "long", "extra-long"], currency).toContain(result.length);
    }
  });

  it("returns a safe placeholder for invalid values", () => {
    expect(formatPrice("not-a-number", "USD")).toBe("—");
    expect(formatPriceVariants("not-a-number", "USD")).toEqual({
      exact: "—",
      compact: "—",
      length: "short",
    });
  });
});
