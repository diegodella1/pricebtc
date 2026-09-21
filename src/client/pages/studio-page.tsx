import { widgetExport, getWidgetDimensions, writeClipboard } from "../lib/widget-export.js";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { WidgetConfig, WidgetMode } from "../../shared/widget-config.js";
import {
  DEFAULT_EMBED_CONFIG,
  DEFAULT_OVERLAY_CONFIG,
  HISTORY_RANGES,
  layoutSupportsChart,
  MOTION_LEVELS,
  parseWidgetConfig,
  WIDGET_FONTS,
  WIDGET_LAYOUT_META,
  WIDGET_LAYOUTS,
  WIDGET_THEMES,
} from "../../shared/widget-config.js";
import { Brand } from "../components/brand.js";
import { CurrencySelect } from "../components/currency-select.js";
import { WidgetRenderer } from "../components/widget-renderer.js";
import { useCurrencies, useLivePrice, usePriceHistory } from "../hooks/use-market.js";
import { getContrastResult } from "../lib/color-contrast.js";
import { formatRelativeTime } from "../lib/format.js";

interface StudioState {
  activeTab: "preview" | "embed" | "obs" | "share";
  mode: WidgetMode;
  drafts: Record<WidgetMode, WidgetConfig>;
}

type CopyState = "iframe" | "obs-url" | "direct-url" | "markdown" | "error" | null;
type ColorKey = "accent" | "text" | "surface";

const COLOR_KEYS: ColorKey[] = ["accent", "text", "surface"];

function getInitialStudioState(): StudioState {
  const params = new URLSearchParams(window.location.search);
  const mode: WidgetMode = params.get("mode") === "overlay" ? "overlay" : "embed";
  const tabParam = params.get("tab");
  const activeTab: StudioState["activeTab"] = 
    tabParam === "embed" ? "embed" :
    tabParam === "obs" ? "obs" :
    tabParam === "share" ? "share" : "preview";
  return {
    activeTab,
    mode,
    drafts: {
      embed: mode === "embed" ? parseWidgetConfig(params, "embed") : { ...DEFAULT_EMBED_CONFIG },
      overlay: mode === "overlay" ? parseWidgetConfig(params, "overlay") : { ...DEFAULT_OVERLAY_CONFIG },
    },
  };
}

function getEffectiveColors(config: WidgetConfig): Record<ColorKey, string> {
  if (config.theme === "custom") {
    return { accent: config.accent, text: config.text, surface: config.surface };
  }
  if (config.theme === "light") {
    return { accent: config.accent, text: "002B36", surface: "FDF6E3" };
  }
  return { accent: config.accent, text: "FDF6E3", surface: "0D1012" };
}

export function StudioPage() {
  const [studioState, setStudioState] = useState<StudioState>(getInitialStudioState);
  const [copied, setCopied] = useState<CopyState>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const { activeTab, mode, drafts } = studioState;
  const config = drafts[mode];
  const layoutMeta = WIDGET_LAYOUT_META[config.layout];
  const chartSupported = layoutSupportsChart(config.layout);
  const historyEnabled = config.showChart && chartSupported;
  const { currencies } = useCurrencies();
  const { price, connectionState } = useLivePrice(config.currency);
  const { points, loading: historyLoading, error: historyError } = usePriceHistory(
    config.currency,
    config.range,
    historyEnabled,
  );
  const live = connectionState === "live" && price?.status === "live";
  const status = live ? "Live" : price ? "Stale" : "Unavailable";
  const relativeTime = price ? formatRelativeTime(price.marketTimestamp) : null;
  const effectiveColors = getEffectiveColors(config);
  const textContrast = getContrastResult(effectiveColors.text, effectiveColors.surface);
  const accentContrast = getContrastResult(effectiveColors.accent, effectiveColors.surface);

  const { query: rendererQuery, url: rendererUrl, code: iframeCode, markdown: markdownCode } = widgetExport(config, mode);
  const dimensions = getWidgetDimensions(config);
  const previewStyle: CSSProperties | undefined = mode === "embed"
    ? { aspectRatio: layoutMeta.aspectRatio }
    : undefined;

  useEffect(() => {
    const params = new URLSearchParams([["mode", mode], ["tab", activeTab]]);
    for (const [key, value] of new URLSearchParams(rendererQuery)) params.set(key, value);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [mode, activeTab, rendererQuery]);

  useEffect(() => () => {
    if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
  }, []);

  function updateConfig<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setStudioState((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [current.mode]: { ...current.drafts[current.mode], [key]: value },
      },
    }));
  }

  function switchTab(tab: StudioState["activeTab"]) {
    setStudioState((current) => {
      const newMode: WidgetMode = tab === "obs" ? "overlay" : "embed";
      return {
        ...current,
        activeTab: tab,
        mode: newMode,
      };
    });
  }

  async function copy(value: string, kind: Exclude<CopyState, "error" | null>) {
    if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
    try {
      await writeClipboard(value);
      setCopied(kind);
    } catch {
      setCopied("error");
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopied(null);
      copyTimeoutRef.current = null;
    }, 1_800);
  }

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-preview">Skip to live preview</a>
      <header className="studio-header">
        <Brand compact />
        <h1 className="studio-header__title" translate="no">Widget Studio</h1>
        <a href="/" aria-label="Exit Studio">Back to price <span aria-hidden="true">×</span></a>
      </header>

      <nav className="studio-tabs" role="tablist" aria-label="Studio sections">
        <button
          role="tab"
          aria-selected={activeTab === "preview"}
          aria-controls="tab-preview"
          type="button"
          onClick={() => switchTab("preview")}
        >
          Preview
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "embed"}
          aria-controls="tab-embed"
          type="button"
          onClick={() => switchTab("embed")}
        >
          Embed
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "obs"}
          aria-controls="tab-obs"
          type="button"
          onClick={() => switchTab("obs")}
        >
          OBS
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "share"}
          aria-controls="tab-share"
          type="button"
          onClick={() => switchTab("share")}
        >
          Share
        </button>
      </nav>

      <main className="studio-layout" id="studio-main">
        <div
          id="tab-preview"
          role="tabpanel"
          aria-labelledby="tab-preview"
          hidden={activeTab !== "preview"}
          className="studio-tab-panel"
        >
          <section className="studio-above-fold" aria-labelledby="preview-title">
            <div className="above-fold-content">
              <div className="preview-section">
                <div className="preview-header">
                  <h2 id="preview-title" className={live ? "is-live" : "is-stale"}>
                    <i aria-hidden="true" /> {status}
                  </h2>
                  {relativeTime && (
                    <span className="preview-time" title={price?.marketTimestamp}>
                      Updated {relativeTime}
                    </span>
                  )}
                </div>
                <div className={`preview-stage preview-stage--${mode}`}>
                  <div className="preview-corner preview-corner--tl" /><div className="preview-corner preview-corner--tr" />
                  <div className="preview-corner preview-corner--bl" /><div className="preview-corner preview-corner--br" />
                  <div className={`preview-widget preview-widget--${config.layout}`} style={previewStyle} data-layout={config.layout}>
                    <WidgetRenderer config={config} mode={mode} price={price} history={points} connectionState={connectionState} historyLoading={historyLoading} historyError={historyError} />
                  </div>
                </div>
                <div className="preview-action">
                  <button type="button" className="studio-copy-primary" onClick={() => void copy(mode === "overlay" ? rendererUrl : iframeCode, mode === "overlay" ? "obs-url" : "iframe")}>
                    {copied === "iframe" || copied === "obs-url" ? "COPIED ✓" : "COPY"}
                  </button>
                </div>
              </div>

              <aside className="presets-sidebar" aria-labelledby="presets-title">
                <h3 id="presets-title">Layout</h3>
                <div className="preset-grid">
                  {WIDGET_LAYOUTS.map((layout) => (
                    <button
                      key={layout}
                      aria-pressed={config.layout === layout}
                      className={config.layout === layout ? "is-active" : ""}
                      type="button"
                      onClick={() => updateConfig("layout", layout)}
                      title={WIDGET_LAYOUT_META[layout].label}
                    >
                      <i className={`preset-icon preset-icon--${layout}`} aria-hidden="true"><span /></i>
                      <span className="preset-label">{WIDGET_LAYOUT_META[layout].label}</span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className="studio-controls" aria-labelledby="studio-controls-title">
            <details className="studio-controls-accordion" open>
              <summary>
                <h2 id="studio-controls-title">Customize widget</h2>
              </summary>
              <div className="studio-controls-content">
                <fieldset className="control-group">
                  <legend>Content</legend>
                  <CurrencySelect currencies={currencies} value={config.currency} onChange={(value) => updateConfig("currency", value)} id="studio-currency" compact />
                  <label className={`studio-field${chartSupported ? "" : " is-disabled"}`}>
                    <span>CHART RANGE</span>
                    <select
                      name="studio-chart-range"
                      autoComplete="off"
                      value={config.range}
                      disabled={!chartSupported}
                      aria-describedby={!chartSupported ? "chart-capability-note" : undefined}
                      onChange={(event) => updateConfig("range", event.target.value as WidgetConfig["range"])}
                    >
                      {HISTORY_RANGES.map((range) => <option key={range} value={range}>{range.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <div className="toggle-row">
                    <label>
                      <input name="studio-show-change" type="checkbox" checked={config.showChange} onChange={(event) => updateConfig("showChange", event.target.checked)} />
                      <span aria-hidden="true" /> 24H CHANGE
                    </label>
                    <label className={chartSupported ? "" : "is-disabled"}>
                      <input
                        name="studio-show-chart"
                        type="checkbox"
                        checked={config.showChart}
                        disabled={!chartSupported}
                        aria-describedby={!chartSupported ? "chart-capability-note" : undefined}
                        onChange={(event) => updateConfig("showChart", event.target.checked)}
                      />
                      <span aria-hidden="true" /> CHART
                    </label>
                    <label className={chartSupported && historyEnabled && config.currency === "USD" ? "" : "is-disabled"}>
                      <input
                        name="studio-show-volume"
                        type="checkbox"
                        checked={config.showVolume}
                        disabled={!chartSupported || !historyEnabled || config.currency !== "USD"}
                        aria-describedby={!chartSupported || !historyEnabled || config.currency !== "USD" ? "volume-capability-note" : undefined}
                        onChange={(event) => updateConfig("showVolume", event.target.checked)}
                      />
                      <span aria-hidden="true" /> VOLUME
                    </label>
                  </div>
                  {!chartSupported ? <p className="control-hint" id="chart-capability-note">NOT AVAILABLE IN THIS LAYOUT</p> : null}
                  {chartSupported && config.currency !== "USD" ? <p className="control-hint" id="volume-capability-note">VOLUME AVAILABLE FOR USD ONLY</p> : null}
                </fieldset>

                <fieldset className="control-group">
                  <legend>Appearance</legend>
                  <span className="studio-label">Theme</span>
                  <div className="segmented-control">
                    {WIDGET_THEMES.map((theme) => (
                      <button key={theme} aria-pressed={config.theme === theme} className={config.theme === theme ? "is-active" : ""} type="button" onClick={() => updateConfig("theme", theme)}>{theme.toUpperCase()}</button>
                    ))}
                  </div>
                  <div className="color-grid">
                    {COLOR_KEYS.map((colorKey) => {
                      const editable = colorKey === "accent" || config.theme === "custom";
                      const value = effectiveColors[colorKey];
                      return (
                        <label key={colorKey} className={editable ? "" : "is-disabled"}>
                          <span>{colorKey.toUpperCase()}</span>
                          <i style={{ backgroundColor: `#${value}` }}>
                            <input
                              name={`studio-${colorKey}-color`}
                              type="color"
                              value={`#${value}`}
                              disabled={!editable}
                              aria-describedby={!editable ? "custom-color-note" : undefined}
                              onChange={(event) => updateConfig(colorKey, event.target.value.slice(1).toUpperCase())}
                            />
                          </i>
                          <code translate="no">#{value}</code>
                        </label>
                      );
                    })}
                  </div>
                  {config.theme !== "custom" ? <p className="control-hint" id="custom-color-note">SELECT CUSTOM TO EDIT TEXT &amp; SURFACE</p> : null}
                  {config.theme === "custom" ? (
                    <div className="contrast-matrix" aria-label="Custom theme contrast checks">
                      {config.background === "transparent" ? (
                        <span>CONTRAST // HOST DEPENDENT</span>
                      ) : (
                        <>
                          <span className={textContrast.passesAa ? "is-pass" : "is-warning"}>TEXT {textContrast.label}</span>
                          <span className={accentContrast.passesAa ? "is-pass" : "is-warning"}>ACCENT {accentContrast.label}</span>
                        </>
                      )}
                    </div>
                  ) : null}
                  <details className="studio-advanced"><summary>Advanced appearance</summary>
                  <div className="studio-field-grid">
                    <label className="studio-field">
                      <span>TYPE</span>
                      <select name="studio-font" autoComplete="off" value={config.font} onChange={(event) => updateConfig("font", event.target.value as WidgetConfig["font"])}>
                        {WIDGET_FONTS.map((font) => <option key={font} value={font}>{font.toUpperCase()}</option>)}</select>
                    </label>
                    <label className="studio-field">
                      <span>BACKGROUND</span>
                      <select name="studio-background" autoComplete="off" value={config.background} onChange={(event) => updateConfig("background", event.target.value as WidgetConfig["background"])}>
                        <option value="solid">SOLID</option><option value="transparent">TRANSPARENT</option>
                      </select>
                    </label>
                  </div>
                  <label className="range-control">
                    <span>SCALE <output>{config.scale}%</output></span>
                    <input name="studio-scale" type="range" min="75" max="200" step="5" value={config.scale} onChange={(event) => updateConfig("scale", Number(event.target.value))} />
                  </label>
                  <label className="studio-field">
                    <span>MOTION</span>
                    <select name="studio-motion" autoComplete="off" value={config.motion} onChange={(event) => updateConfig("motion", event.target.value as WidgetConfig["motion"])}>
                      {MOTION_LEVELS.map((motion) => <option key={motion} value={motion}>{motion.toUpperCase()}</option>)}</select>
                  </label>
                  </details>
                </fieldset>

                <fieldset className="control-group">
                  <legend>Branding</legend>
                  <div className="pro-teaser">
                    <div className="pro-teaser-icon">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M10 2L12.5 7.5L18 8L14 12.5L15 18L10 15L5 18L6 12.5L2 8L7.5 7.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="pro-teaser-content">
                      <p>Includes PRICEB.TC mark · Pro removes it</p>
                    </div>
                    <a href="/pricing" className="pro-teaser-link">View pricing →</a>
                  </div>
                </fieldset>
              </div>
            </details>
          </section>
        </div>

        <div
          id="tab-embed"
          role="tabpanel"
          aria-labelledby="tab-embed"
          hidden={activeTab !== "embed"}
          className="studio-tab-panel studio-export-panel"
        >
          <div className="export-content">
            <div className="export-header">
              <h2>Embed code</h2>
              <span className="free-badge">Free · No account</span>
            </div>
            <p className="export-description">Paste this iframe code into your website to display the Bitcoin price widget.</p>
            <div className="export-field-full">
              <label htmlFor="embed-code">IFRAME CODE</label>
              <textarea id="embed-code" name="embed-code" autoComplete="off" spellCheck={false} readOnly value={iframeCode} rows={6} />
              <button type="button" className="studio-copy-primary" onClick={() => void copy(iframeCode, "iframe")}>{copied === "iframe" ? "COPIED ✓" : "COPY"}</button>
            </div>
            <div className="export-field-full">
              <label htmlFor="embed-direct-url">DIRECT URL</label>
              <input id="embed-direct-url" name="embed-direct-url" autoComplete="off" spellCheck={false} readOnly value={rendererUrl} />
              <button type="button" className="studio-copy-secondary" onClick={() => void copy(rendererUrl, "direct-url")}>{copied === "direct-url" ? "COPIED ✓" : "COPY URL"}</button>
            </div>
            {copied === "error" && <p className="copy-status is-error" role="status">COPY FAILED // SELECT FIELD & COPY MANUALLY</p>}
          </div>
        </div>

        <div
          id="tab-obs"
          role="tabpanel"
          aria-labelledby="tab-obs"
          hidden={activeTab !== "obs"}
          className="studio-tab-panel studio-export-panel"
        >
          <div className="export-content">
            <div className="export-header">
              <h2>OBS Browser Source</h2>
              <span className="free-badge">Free · No account</span>
            </div>
            <div className="obs-steps">
              <div className="obs-step">
                <span className="obs-step-number">1</span>
                <div className="obs-step-content">
                  <h3>Add Browser Source</h3>
                  <p>In OBS Studio, click the + icon in Sources and select <strong>Browser</strong>.</p>
                </div>
              </div>
              <div className="obs-step">
                <span className="obs-step-number">2</span>
                <div className="obs-step-content">
                  <h3>Paste URL below</h3>
                  <p>Copy the Browser Source URL and paste it into the URL field in OBS.</p>
                </div>
              </div>
              <div className="obs-step">
                <span className="obs-step-number">3</span>
                <div className="obs-step-content">
                  <h3>Configure canvas</h3>
                  <p>Set Width to <strong>1920</strong> and Height to <strong>1080</strong>. Turn off "Shutdown source when not visible".</p>
                </div>
              </div>
            </div>
            <div className="export-field-full">
              <label htmlFor="obs-url">BROWSER SOURCE URL</label>
              <textarea id="obs-url" name="obs-url" autoComplete="off" spellCheck={false} readOnly value={rendererUrl} rows={4} />
              <button type="button" className="studio-copy-primary" onClick={() => void copy(rendererUrl, "obs-url")}>{copied === "obs-url" ? "COPIED ✓" : "COPY URL"}</button>
            </div>
            {copied === "error" && <p className="copy-status is-error" role="status">COPY FAILED // SELECT FIELD & COPY MANUALLY</p>}
          </div>
        </div>

        <div
          id="tab-share"
          role="tabpanel"
          aria-labelledby="tab-share"
          hidden={activeTab !== "share"}
          className="studio-tab-panel studio-export-panel"
        >
          <div className="export-content">
            <div className="export-header">
              <h2>Share widget</h2>
              <span className="free-badge">Free · No account</span>
            </div>
            <p className="export-description">Share your customized Bitcoin price widget using a direct link or markdown embed.</p>
            
            <div className="export-field-full">
              <label htmlFor="share-url">WIDGET URL</label>
              <input id="share-url" name="share-url" autoComplete="off" spellCheck={false} readOnly value={rendererUrl} />
              <button type="button" className="studio-copy-primary" onClick={() => void copy(rendererUrl, "direct-url")}>{copied === "direct-url" ? "COPIED ✓" : "COPY URL"}</button>
            </div>

            <div className="export-field-full">
              <label htmlFor="share-markdown">MARKDOWN EMBED</label>
              <textarea id="share-markdown" name="share-markdown" autoComplete="off" spellCheck={false} readOnly value={markdownCode} rows={2} />
              <button type="button" className="studio-copy-secondary" onClick={() => void copy(markdownCode, "markdown")}>{copied === "markdown" ? "COPIED ✓" : "COPY MARKDOWN"}</button>
            </div>

            <div className="share-dimensions">
              <h3>Widget dimensions</h3>
              <div className="dimension-grid">
                <div className="dimension-item">
                  <span className="dimension-label">ASPECT RATIO</span>
                  <span className="dimension-value">{dimensions.aspectLabel}</span>
                </div>
                <div className="dimension-item">
                  <span className="dimension-label">MIN WIDTH</span>
                  <span className="dimension-value">{dimensions.minWidth}px</span>
                </div>
                <div className="dimension-item">
                  <span className="dimension-label">MIN HEIGHT</span>
                  <span className="dimension-value">{dimensions.minHeight}px</span>
                </div>
              </div>
            </div>

            {copied === "error" && <p className="copy-status is-error" role="status">COPY FAILED // SELECT FIELD & COPY MANUALLY</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
