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
    expect(screen.getByLabelText("Bitcoin price $104,250.42")).toHaveAttribute("title", "$104,250.42");
    expect(screen.getByLabelText("Bitcoin price $104,250.42")).toHaveAttribute("data-price-length", "medium");
    expect(screen.getByText(/\$104K/)).toHaveClass("widget__price-compact");
    expect(screen.getByText("+2.34%")).toBeInTheDocument();
    expect(screen.getByText("COINBASE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bitcoin price by PRICEB.TC" })).toBeInTheDocument();
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

  it.each([
    ["connecting", "SYNCING"],
    ["stopped", "OFFLINE"],
    ["unavailable", "OFFLINE"],
  ] as const)("maps %s connection state to %s", (connectionState, label) => {
    render(
      <WidgetRenderer
        config={DEFAULT_EMBED_CONFIG}
        mode="embed"
        price={null}
        history={[]}
        connectionState={connectionState}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByLabelText(connectionState === "connecting" ? "Bitcoin price syncing" : "Bitcoin price unavailable")).toBeInTheDocument();
  });

  it("does not render or request a visual chart in unsupported layouts", () => {
    render(
      <WidgetRenderer
        config={{ ...DEFAULT_EMBED_CONFIG, layout: "lower-third", showChart: true }}
        mode="embed"
        price={getPrice()}
        history={history}
        connectionState="live"
        historyLoading
      />,
    );

    expect(screen.queryByLabelText("Bitcoin price chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading Bitcoin price history…")).not.toBeInTheDocument();
  });

  it("shows distinct chart loading and unavailable states", () => {
    const { rerender } = render(
      <WidgetRenderer
        config={DEFAULT_EMBED_CONFIG}
        mode="embed"
        price={getPrice()}
        history={[]}
        connectionState="live"
        historyLoading
      />,
    );
    expect(screen.getByText("Loading Bitcoin price history…")).toBeInTheDocument();

    rerender(
      <WidgetRenderer
        config={DEFAULT_EMBED_CONFIG}
        mode="embed"
        price={getPrice()}
        history={[]}
        connectionState="live"
        historyError="History unavailable"
      />,
    );
    expect(screen.getByText("HISTORY UNAVAILABLE")).toBeInTheDocument();
  });

  it("maps built-in and custom themes without changing the public config shape", () => {
    const { container, rerender } = render(
      <WidgetRenderer
        config={{ ...DEFAULT_EMBED_CONFIG, theme: "light" }}
        mode="embed"
        price={getPrice()}
        history={history}
        connectionState="live"
      />,
    );

    const widget = container.querySelector<HTMLElement>(".widget");
    expect(widget).toHaveClass("widget--theme-light");
    expect(widget?.style.getPropertyValue("--widget-text")).toBe("#002B36");
    expect(widget?.style.getPropertyValue("--widget-surface")).toBe("#FDF6E3");

    rerender(
      <WidgetRenderer
        config={{ ...DEFAULT_EMBED_CONFIG, theme: "custom", text: "112233", surface: "DDEEFF", background: "transparent" }}
        mode="overlay"
        price={getPrice()}
        history={history}
        connectionState="live"
      />,
    );

    expect(widget).toHaveClass("widget--theme-custom", "widget--transparent");
    expect(widget?.style.getPropertyValue("--widget-text")).toBe("#112233");
    expect(widget?.style.getPropertyValue("--widget-surface")).toBe("transparent");
  });
});
