import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMBED_CONFIG,
  DEFAULT_OVERLAY_CONFIG,
  parseWidgetConfig,
  serializeWidgetConfig,
} from "../src/shared/widget-config.js";

describe("widget config", () => {
  it("uses mode-specific defaults", () => {
    expect(parseWidgetConfig(new URLSearchParams(), "embed")).toEqual(DEFAULT_EMBED_CONFIG);
    expect(parseWidgetConfig(new URLSearchParams(), "overlay")).toEqual(DEFAULT_OVERLAY_CONFIG);
  });

  it("accepts safe customization values", () => {
    const params = new URLSearchParams(
      "v=1&currency=EUR&layout=ticker&theme=custom&accent=00FFAA&text=FFFFFF&surface=101010&font=mono&scale=140&background=transparent&change=0&chart=1&range=7d&motion=none",
    );

    expect(parseWidgetConfig(params, "embed")).toMatchObject({
      currency: "EUR",
      layout: "ticker",
      theme: "custom",
      accent: "00FFAA",
      scale: 140,
      background: "transparent",
      showChange: false,
      showChart: true,
      range: "7d",
      motion: "none",
    });
  });

  it("rejects injection-shaped values and clamps scale", () => {
    const params = new URLSearchParams({
      currency: "usd<script>",
      accent: "url(javascript:alert(1))",
      scale: "9999",
      layout: "unknown",
    });

    const config = parseWidgetConfig(params, "embed");

    expect(config.currency).toBe("USD");
    expect(config.accent).toBe(DEFAULT_EMBED_CONFIG.accent);
    expect(config.scale).toBe(200);
    expect(config.layout).toBe(DEFAULT_EMBED_CONFIG.layout);
  });

  it("round-trips through stable query parameters", () => {
    const query = serializeWidgetConfig({
      ...DEFAULT_OVERLAY_CONFIG,
      currency: "ARS",
      layout: "lower-third",
      scale: 125,
      range: "1h",
    });

    expect(parseWidgetConfig(query, "overlay")).toEqual({
      ...DEFAULT_OVERLAY_CONFIG,
      currency: "ARS",
      layout: "lower-third",
      scale: 125,
      range: "1h",
    });
  });
});
