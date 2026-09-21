import { describe, expect, it } from "vitest";

import { formatUtcDate, formatUtcTime, getMarketTelemetry } from "../src/client/lib/market-telemetry.js";

describe("market telemetry", () => {
  it("derives high, low, and range change from valid points", () => {
    expect(
      getMarketTelemetry([
        { timestamp: "2026-08-27T10:00:00.000Z", price: "100" },
        { timestamp: "2026-08-27T11:00:00.000Z", price: "90" },
        { timestamp: "2026-08-27T12:00:00.000Z", price: "110" },
      ]),
    ).toEqual({ high: 110, low: 90, changePercent: 10 });
  });

  it("ignores malformed values and handles missing telemetry", () => {
    expect(
      getMarketTelemetry([
        { timestamp: "2026-08-27T10:00:00.000Z", price: "bad" },
        { timestamp: "2026-08-27T11:00:00.000Z", price: "42" },
      ]),
    ).toEqual({ high: 42, low: 42, changePercent: 0 });
    expect(getMarketTelemetry([])).toBeNull();
  });

  it("formats timestamps in UTC and rejects invalid input", () => {
    expect(formatUtcTime("2026-08-27T17:08:09.000Z")).toBe("17:08:09 UTC");
    expect(formatUtcDate("2026-08-27T17:08:09.000Z")).toBe("27 AUG 2026");
    expect(formatUtcTime("invalid")).toBe("—");
    expect(formatUtcDate(null)).toBe("—");
  });
});
