// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { formatPrice } from "../src/client/lib/format.js";

describe("formatPrice", () => {
  it("uses fiat-aware precision", () => {
    expect(formatPrice("104250.42", "USD")).toContain("104,250.42");
    expect(formatPrice("167000000", "ARS")).toContain("167,000,000");
    expect(formatPrice("16700000", "JPY")).not.toContain(".00");
  });

  it("returns a safe placeholder for invalid values", () => {
    expect(formatPrice("not-a-number", "USD")).toBe("—");
  });
});
