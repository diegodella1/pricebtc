// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WidgetRenderer } from "../src/client/components/widget-renderer.js";
import type { HistoryPoint, PricePayload } from "../src/shared/contracts.js";
import { DEFAULT_EMBED_CONFIG } from "../src/shared/widget-config.js";

function getPrice(overrides: Partial<PricePayload> = {}): PricePayload {
  return {
    currency: "USD",
    price: "104250.42",
    priceUsd: "104250.42",
    change24h: 2.34,
    marketTimestamp: "2026-08-24T17:00:00.000Z",
    receivedAt: "2026-08-24T17:00:00.100Z",
    fxUpdatedAt: "2026-08-24T00:00:00.000Z",
    status: "live",
    source: "coinbase",
    ...overrides,
  };
}

const history: HistoryPoint[] = [
  { timestamp: "2026-08-24T16:00:00.000Z", price: "100000" },
  { timestamp: "2026-08-24T17:00:00.000Z", price: "104250.42" },
];

describe("WidgetRenderer", () => {
  it("renders live price, change, source, and permanent brand", () => {
    render(
      <WidgetRenderer
        config={DEFAULT_EMBED_CONFIG}
        mode="embed"
        price={getPrice()}
        history={history}
        connectionState="live"
      />,
    );

    expect(screen.getByText("$104,250.42")).toBeInTheDocument();
    expect(screen.getByText("+2.34%")).toBeInTheDocument();
    expect(screen.getByText("COINBASE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "priceb.tc" })).toBeInTheDocument();
  });

  it("respects hidden chart and change settings", () => {
    render(
      <WidgetRenderer
        config={{ ...DEFAULT_EMBED_CONFIG, showChange: false, showChart: false }}
        mode="embed"
        price={getPrice()}
        history={history}
        connectionState="live"
      />,
    );

    expect(screen.queryByText("+2.34%")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Bitcoin price chart")).not.toBeInTheDocument();
  });

  it("marks stale values visibly", () => {
    render(
      <WidgetRenderer
        config={DEFAULT_EMBED_CONFIG}
        mode="overlay"
        price={getPrice({ status: "stale" })}
        history={history}
        connectionState="degraded"
      />,
    );

    expect(screen.getByText("DELAYED")).toBeInTheDocument();
  });
});
