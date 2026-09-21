import { describe, expect, it } from "vitest";
import {
  amount,
  btcToSats,
  satsToBtc,
  roundWindow,
  invoiceDeadline,
  validateProfile,
} from "../../src/server/sats-bid/domain.js";

describe("Sats Bid invariants", () => {
  it.each([
    "0",
    "-1",
    "1.1",
    "1e3",
    " 1000",
    "01000",
    "9223372036854775808",
    1000,
  ])("rejects invalid amounts %s", (value) => {
    expect(() => amount(value)).toThrow();
  });
  it("converts without the market price or floating point", () => {
    expect(satsToBtc("1")).toBe("0.00000001");
    expect(satsToBtc("10000")).toBe("0.00010000");
    expect(btcToSats("0.00010000")).toBe("10000");
    expect(() => btcToSats("0.000000001")).toThrow();
  });
  it("uses UTC and refuses invoices during the final two minutes", () => {
    const now = new Date("2026-09-07T23:57:59Z");
    expect(roundWindow(now).date).toBe("2026-09-07");
    expect(invoiceDeadline(now, 600, 120, 60).toISOString()).toBe(
      "2026-09-07T23:59:00.000Z",
    );
    expect(() =>
      invoiceDeadline(new Date("2026-09-07T23:58:00Z"), 600, 120, 60),
    ).toThrow();
    expect(roundWindow(new Date("2026-09-08T00:00:00Z")).date).toBe(
      "2026-09-08",
    );
  });
  it.each([
    "javascript:alert(1)",
    "https://127.0.0.1",
    "https://localhost",
    "https://user:pass@example.com",
    "http://example.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(() =>
      validateProfile({ name: "A", description: "B", url }),
    ).toThrow();
  });
});
