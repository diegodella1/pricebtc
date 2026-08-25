import { useMemo, useState } from "react";

import type { WidgetConfig, WidgetLayout, WidgetMode } from "../../shared/widget-config.js";
import {
  DEFAULT_EMBED_CONFIG,
  DEFAULT_OVERLAY_CONFIG,
  HISTORY_RANGES,
  MOTION_LEVELS,
  serializeWidgetConfig,
  WIDGET_FONTS,
  WIDGET_LAYOUTS,
  WIDGET_THEMES,
} from "../../shared/widget-config.js";
import { Brand } from "../components/brand.js";
import { CurrencySelect } from "../components/currency-select.js";
import { WidgetRenderer } from "../components/widget-renderer.js";
import { useCurrencies, useLivePrice, usePriceHistory } from "../hooks/use-market.js";

const LAYOUT_NAMES: Record<WidgetLayout, string> = {
  price: "Price only",
  card: "Market card",
  ticker: "Ticker bar",
  corner: "Corner bug",
  "lower-third": "Lower third",
  chart: "Chart panel",
};

function getInitialMode(): WidgetMode {
  return new URLSearchParams(window.location.search).get("mode") === "overlay" ? "overlay" : "embed";
}

export function StudioPage() {
  const [mode, setMode] = useState<WidgetMode>(getInitialMode);
  const [config, setConfig] = useState<WidgetConfig>(() =>
    getInitialMode() === "overlay" ? { ...DEFAULT_OVERLAY_CONFIG } : { ...DEFAULT_EMBED_CONFIG },
  );
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const { currencies } = useCurrencies();
  const { price, connectionState } = useLivePrice(config.currency);
  const { points } = usePriceHistory(config.currency, config.range, config.showChart);

  const rendererUrl = useMemo(() => {
    const query = serializeWidgetConfig(config);
    return `${window.location.origin}/${mode}?${query.toString()}`;
  }, [config, mode]);
  const iframeCode = `<iframe src="${rendererUrl}" title="Live Bitcoin price" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" style="border:0;width:100%;aspect-ratio:16/9" allow="clipboard-write"></iframe>`;

  function updateConfig<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function changeMode(nextMode: WidgetMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setConfig(nextMode === "overlay" ? { ...DEFAULT_OVERLAY_CONFIG } : { ...DEFAULT_EMBED_CONFIG });
    window.history.replaceState(null, "", `/studio?mode=${nextMode}`);
  }

  async function copy(value: string, kind: "url" | "code") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1_800);
  }

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <Brand compact />
        <span className="studio-header__title">WIDGET STUDIO / V1</span>
        <a href="/">CLOSE <span aria-hidden="true">×</span></a>
      </header>

      <main className="studio-layout">
        <aside className="studio-controls" aria-label="Widget controls">
          <div className="studio-controls__heading">
            <span>CONFIGURATION</span>
            <strong>MAKE THE SIGNAL YOURS.</strong>
          </div>

          <fieldset className="control-group">
            <legend>01 / OUTPUT</legend>
            <div className="segmented-control segmented-control--large">
              <button className={mode === "embed" ? "is-active" : ""} type="button" onClick={() => changeMode("embed")}>WEB EMBED</button>
              <button className={mode === "overlay" ? "is-active" : ""} type="button" onClick={() => changeMode("overlay")}>OBS OVERLAY</button>
            </div>
          </fieldset>

          <fieldset className="control-group">
            <legend>02 / LAYOUT</legend>
            <div className="preset-grid">
              {WIDGET_LAYOUTS.map((layout) => (
                <button
                  key={layout}
                  className={config.layout === layout ? "is-active" : ""}
                  type="button"
                  onClick={() => updateConfig("layout", layout)}
                >
                  <i className={`preset-icon preset-icon--${layout}`} aria-hidden="true"><span /></i>
                  {LAYOUT_NAMES[layout]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="control-group">
            <legend>03 / MARKET</legend>
            <CurrencySelect currencies={currencies} value={config.currency} onChange={(value) => updateConfig("currency", value)} id="studio-currency" compact />
            <label className="studio-field">
              <span>CHART RANGE</span>
              <select value={config.range} onChange={(event) => updateConfig("range", event.target.value as WidgetConfig["range"])}>
                {HISTORY_RANGES.map((range) => <option key={range} value={range}>{range.toUpperCase()}</option>)}
              </select>
            </label>
            <div className="toggle-row">
              <label><input type="checkbox" checked={config.showChange} onChange={(event) => updateConfig("showChange", event.target.checked)} /><span /> 24H CHANGE</label>
              <label><input type="checkbox" checked={config.showChart} onChange={(event) => updateConfig("showChart", event.target.checked)} /><span /> CHART</label>
            </div>
          </fieldset>

          <fieldset className="control-group">
            <legend>04 / APPEARANCE</legend>
            <span className="studio-label">THEME</span>
            <div className="segmented-control">
              {WIDGET_THEMES.map((theme) => (
                <button key={theme} className={config.theme === theme ? "is-active" : ""} type="button" onClick={() => updateConfig("theme", theme)}>{theme.toUpperCase()}</button>
              ))}
            </div>
            <div className="color-grid">
              {(["accent", "text", "surface"] as const).map((colorKey) => (
                <label key={colorKey}>
                  <span>{colorKey.toUpperCase()}</span>
                  <i style={{ backgroundColor: `#${config[colorKey]}` }}>
                    <input type="color" value={`#${config[colorKey]}`} onChange={(event) => updateConfig(colorKey, event.target.value.slice(1).toUpperCase())} />
                  </i>
                  <code>#{config[colorKey]}</code>
                </label>
              ))}
            </div>
            <div className="studio-field-grid">
              <label className="studio-field">
                <span>TYPE</span>
                <select value={config.font} onChange={(event) => updateConfig("font", event.target.value as WidgetConfig["font"])}>
                  {WIDGET_FONTS.map((font) => <option key={font} value={font}>{font.toUpperCase()}</option>)}
                </select>
              </label>
              <label className="studio-field">
                <span>BACKGROUND</span>
                <select value={config.background} onChange={(event) => updateConfig("background", event.target.value as WidgetConfig["background"])}>
                  <option value="solid">SOLID</option>
                  <option value="transparent">TRANSPARENT</option>
                </select>
              </label>
            </div>
            <label className="range-control">
              <span>SCALE <output>{config.scale}%</output></span>
              <input type="range" min="75" max="200" step="5" value={config.scale} onChange={(event) => updateConfig("scale", Number(event.target.value))} />
            </label>
            <label className="studio-field">
              <span>MOTION</span>
              <select value={config.motion} onChange={(event) => updateConfig("motion", event.target.value as WidgetConfig["motion"])}>
                {MOTION_LEVELS.map((motion) => <option key={motion} value={motion}>{motion.toUpperCase()}</option>)}
              </select>
            </label>
          </fieldset>
        </aside>

        <section className="studio-preview" aria-label="Live preview">
          <div className="preview-toolbar">
            <span><i /> LIVE PREVIEW</span>
            <span>{mode === "overlay" ? "1920 × 1080 SAFE AREA" : "RESPONSIVE / 16:9"}</span>
          </div>
          <div className={`preview-stage preview-stage--${mode}`}>
            <div className="preview-corner preview-corner--tl" /><div className="preview-corner preview-corner--tr" />
            <div className="preview-corner preview-corner--bl" /><div className="preview-corner preview-corner--br" />
            <div className="preview-widget">
              <WidgetRenderer config={config} mode={mode} price={price} history={points} connectionState={connectionState} />
            </div>
          </div>

          <div className="export-panel">
            <div className="export-panel__heading">
              <div><span>05 / EXPORT</span><strong>{mode === "overlay" ? "ADD TO OBS." : "PASTE INTO YOUR SITE."}</strong></div>
              <span className="free-badge">FREE · BRANDED</span>
            </div>
            {mode === "embed" ? (
              <div className="export-field">
                <label htmlFor="embed-code">IFRAME CODE</label>
                <textarea id="embed-code" readOnly value={iframeCode} rows={4} />
                <button type="button" onClick={() => void copy(iframeCode, "code")}>{copied === "code" ? "COPIED ✓" : "COPY CODE"}</button>
              </div>
            ) : (
              <div className="obs-note">
                <span>OBS</span>
                <p>Add a <strong>Browser Source</strong>, paste URL below, then set canvas size to 1920 × 1080. Keep “Shutdown source when not visible” off.</p>
              </div>
            )}
            <div className="export-field export-field--url">
              <label htmlFor="renderer-url">{mode === "overlay" ? "BROWSER SOURCE URL" : "DIRECT URL"}</label>
              <input id="renderer-url" readOnly value={rendererUrl} />
              <button type="button" onClick={() => void copy(rendererUrl, "url")}>{copied === "url" ? "COPIED ✓" : "COPY URL"}</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
