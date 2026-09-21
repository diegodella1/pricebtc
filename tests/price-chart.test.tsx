// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { PriceChart } from "../src/client/components/price-chart.js";

it("stacks actual sides without interpreting rising or falling prices as trade sides", () => {
  const { container } = render(<PriceChart showVolume points={[
    { timestamp: "2026-09-21T10:00:00Z", price: "100", volume: "10", buyVolume: "2", sellVolume: "3" },
    { timestamp: "2026-09-21T10:01:00Z", price: "200", volume: "4" },
  ]} />);
  expect(container.querySelectorAll(".price-chart__buy-volume")).toHaveLength(1);
  expect(container.querySelectorAll(".price-chart__sell-volume")).toHaveLength(1);
  const buy = container.querySelector(".price-chart__buy-volume")!;
  const sell = container.querySelector(".price-chart__sell-volume")!;
  const total = container.querySelector(".price-chart__volume")!;
  expect(Number(buy.getAttribute("height")) / Number(total.getAttribute("height"))).toBeCloseTo(0.2);
  expect(Number(sell.getAttribute("height")) / Number(total.getAttribute("height"))).toBeCloseTo(0.3);
  expect(Number(sell.getAttribute("y")) + Number(sell.getAttribute("height"))).toBeCloseTo(Number(buy.getAttribute("y")));
  expect(container.textContent).toContain("Buy/sell split unavailable");
});

it("preserves recorded sides even when the cached candle total is older", () => {
  const { container } = render(<PriceChart showVolume points={[
    { timestamp: "2026-09-21T10:00:00Z", price: "100", volume: "1", buyVolume: "2", sellVolume: "3" },
    { timestamp: "2026-09-21T10:01:00Z", price: "101" },
  ]} />);
  const buy = Number(container.querySelector(".price-chart__buy-volume")!.getAttribute("height"));
  const sell = Number(container.querySelector(".price-chart__sell-volume")!.getAttribute("height"));
  const total = Number(container.querySelector(".price-chart__volume")!.getAttribute("height"));
  expect(buy + sell).toBeCloseTo(total);
  expect(buy / sell).toBeCloseTo(2 / 3);
});

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
