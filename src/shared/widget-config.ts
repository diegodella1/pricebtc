export const WIDGET_LAYOUTS = ["price", "card", "ticker", "corner", "lower-third", "chart"] as const;
export const WIDGET_THEMES = ["dark", "light", "custom"] as const;
export const WIDGET_FONTS = ["display", "sans", "mono"] as const;
export const WIDGET_BACKGROUNDS = ["solid", "transparent"] as const;
export const HISTORY_RANGES = ["1h", "24h", "7d"] as const;
export const MOTION_LEVELS = ["full", "reduced", "none"] as const;

export type WidgetLayout = (typeof WIDGET_LAYOUTS)[number];
export type WidgetTheme = (typeof WIDGET_THEMES)[number];
export type WidgetFont = (typeof WIDGET_FONTS)[number];
export type WidgetBackground = (typeof WIDGET_BACKGROUNDS)[number];
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export type WidgetMode = "embed" | "overlay";

export interface WidgetLayoutMeta {
  label: string;
  aspectRatio: string;
  aspectLabel: string;
  minWidth: number;
  minHeight: number;
  supportsChart: boolean;
}

export const WIDGET_LAYOUT_META: Record<WidgetLayout, WidgetLayoutMeta> = Object.freeze({
  price: { label: "Price only", aspectRatio: "16 / 9", aspectLabel: "16:9", minWidth: 320, minHeight: 180, supportsChart: false },
  card: { label: "Market card", aspectRatio: "16 / 9", aspectLabel: "16:9", minWidth: 320, minHeight: 180, supportsChart: true },
  ticker: { label: "Ticker bar", aspectRatio: "6 / 1", aspectLabel: "6:1", minWidth: 480, minHeight: 96, supportsChart: true },
  corner: { label: "Corner bug", aspectRatio: "1 / 1", aspectLabel: "1:1", minWidth: 240, minHeight: 240, supportsChart: true },
  "lower-third": { label: "Lower third", aspectRatio: "16 / 3", aspectLabel: "16:3", minWidth: 480, minHeight: 96, supportsChart: false },
  chart: { label: "Chart panel", aspectRatio: "16 / 9", aspectLabel: "16:9", minWidth: 360, minHeight: 203, supportsChart: true },
});

export function layoutSupportsChart(layout: WidgetLayout): boolean {
  return WIDGET_LAYOUT_META[layout].supportsChart;
}

export interface WidgetConfig {
  version: 1;
  currency: string;
  layout: WidgetLayout;
  theme: WidgetTheme;
  accent: string;
  text: string;
  surface: string;
  font: WidgetFont;
  scale: number;
  background: WidgetBackground;
  showChange: boolean;
  showChart: boolean;
  range: HistoryRange;
  motion: MotionLevel;
}

export const DEFAULT_EMBED_CONFIG: WidgetConfig = Object.freeze({
  version: 1,
  currency: "USD",
  layout: "card",
  theme: "dark",
  accent: "CB4B16",
  text: "FDF6E3",
  surface: "002B36",
  font: "mono",
  scale: 100,
  background: "solid",
  showChange: true,
  showChart: true,
  range: "24h",
  motion: "full",
});

export const DEFAULT_OVERLAY_CONFIG: WidgetConfig = Object.freeze({
  ...DEFAULT_EMBED_CONFIG,
  layout: "lower-third",
  background: "transparent",
});

const HEX_COLOR = /^[0-9A-F]{6}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

function enumValue<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function colorValue(value: string | null, fallback: string): string {
  const normalized = value?.toUpperCase() ?? "";
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

function booleanValue(value: string | null, fallback: boolean): boolean {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function scaleValue(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(200, Math.max(75, Math.round(parsed)));
}

export function parseWidgetConfig(params: URLSearchParams, mode: WidgetMode): WidgetConfig {
  const defaults = mode === "overlay" ? DEFAULT_OVERLAY_CONFIG : DEFAULT_EMBED_CONFIG;
  const currency = params.get("currency")?.toUpperCase() ?? defaults.currency;

  return {
    version: 1,
    currency: CURRENCY_CODE.test(currency) ? currency : defaults.currency,
    layout: enumValue(params.get("layout"), WIDGET_LAYOUTS, defaults.layout),
    theme: enumValue(params.get("theme"), WIDGET_THEMES, defaults.theme),
    accent: colorValue(params.get("accent"), defaults.accent),
    text: colorValue(params.get("text"), defaults.text),
    surface: colorValue(params.get("surface"), defaults.surface),
    font: enumValue(params.get("font"), WIDGET_FONTS, defaults.font),
    scale: scaleValue(params.get("scale"), defaults.scale),
    background: enumValue(params.get("background"), WIDGET_BACKGROUNDS, defaults.background),
    showChange: booleanValue(params.get("change"), defaults.showChange),
    showChart: booleanValue(params.get("chart"), defaults.showChart),
    range: enumValue(params.get("range"), HISTORY_RANGES, defaults.range),
    motion: enumValue(params.get("motion"), MOTION_LEVELS, defaults.motion),
  };
}

export function serializeWidgetConfig(config: WidgetConfig): URLSearchParams {
  return new URLSearchParams([
    ["v", "1"],
    ["currency", config.currency],
    ["layout", config.layout],
    ["theme", config.theme],
    ["accent", config.accent],
    ["text", config.text],
    ["surface", config.surface],
    ["font", config.font],
    ["scale", String(config.scale)],
    ["background", config.background],
    ["change", config.showChange ? "1" : "0"],
    ["chart", config.showChart ? "1" : "0"],
    ["range", config.range],
    ["motion", config.motion],
  ]);
}
