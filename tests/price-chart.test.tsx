// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { PriceChart } from "../src/client/components/price-chart.js";

it("keeps volume bars aligned when a price observation has no candle volume", () => {
  const { container } = render(<PriceChart showVolume points={[
    { timestamp: "2026-09-21T10:00:00Z", price: "100" },
    { timestamp: "2026-09-21T10:01:00Z", price: "101", volume: "4" },
    { timestamp: "2026-09-21T10:02:00Z", price: "102", volume: "2" },
  ]} />);
  const bars = container.querySelectorAll(".price-chart__volume");
  expect(bars).toHaveLength(3);
  expect(Number(bars[0]!.getAttribute("height"))).toBe(0);
  expect(Number(bars[1]!.getAttribute("height"))).toBeGreaterThan(Number(bars[2]!.getAttribute("height")));
  expect(Number(bars[1]!.getAttribute("x"))).toBeGreaterThan(Number(bars[0]!.getAttribute("x")));
});
