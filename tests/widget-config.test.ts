import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMBED_CONFIG,
  DEFAULT_OVERLAY_CONFIG,
  layoutSupportsChart,
  parseWidgetConfig,
  serializeWidgetConfig,
  WIDGET_LAYOUT_META,
  WIDGET_LAYOUTS,
} from "../src/shared/widget-config.js";

describe("widget config", () => {
  it("ships Solarized tactical defaults", () => {
    expect(DEFAULT_EMBED_CONFIG).toMatchObject({
      accent: "CB4B16",
      text: "FDF6E3",
      surface: "002B36",
      font: "mono",
    });
  });

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

  it("defines complete rendering geometry and capabilities for every layout", () => {
    expect(Object.keys(WIDGET_LAYOUT_META)).toEqual([...WIDGET_LAYOUTS]);
    expect(WIDGET_LAYOUT_META.ticker).toMatchObject({
      aspectRatio: "6 / 1",
      aspectLabel: "6:1",
      minWidth: 480,
      minHeight: 96,
      supportsChart: true,
    });
    expect(WIDGET_LAYOUT_META.corner.aspectRatio).toBe("1 / 1");
    expect(WIDGET_LAYOUT_META["lower-third"].aspectRatio).toBe("16 / 3");
    expect(layoutSupportsChart("card")).toBe(true);
    expect(layoutSupportsChart("price")).toBe(false);
    expect(layoutSupportsChart("lower-third")).toBe(false);
  });
});
