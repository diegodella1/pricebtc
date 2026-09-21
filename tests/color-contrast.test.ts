import { describe, expect, it } from "vitest";

import { getContrastResult } from "../src/client/lib/color-contrast.js";

describe("color contrast", () => {
  it("reports WCAG AA ratios for solid colors", () => {
    expect(getContrastResult("FDF6E3", "002B36")).toMatchObject({ passesAa: true });
    expect(getContrastResult("CB4B16", "002B36")).toMatchObject({ passesAa: false });
    expect(getContrastResult("E66B35", "002B36")).toMatchObject({ passesAa: true });
    expect(getContrastResult("5D7200", "FDF6E3")).toMatchObject({ passesAa: true });
    expect(getContrastResult("FDF6E3", "A63C10")).toMatchObject({ passesAa: true });
  });

  it("normalizes hash-prefixed values and exposes a rounded ratio", () => {
    const result = getContrastResult("#002B36", "#FDF6E3");
    expect(result.ratio).toBeGreaterThan(13);
    expect(result.label).toMatch(/^AA PASS \/\//);
  });

  it("returns an explicit invalid result instead of throwing", () => {
    expect(getContrastResult("NOPE", "002B36")).toEqual({
      ratio: 0,
      passesAa: false,
      label: "INVALID COLOR",
    });
  });
});
