import { widgetExport, getWidgetDimensions, writeClipboard } from "../lib/widget-export.js";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { WidgetConfig, WidgetMode } from "../../shared/widget-config.js";
import {
  DEFAULT_EMBED_CONFIG,
  DEFAULT_OVERLAY_CONFIG,
  parseWidgetConfig,
  WIDGET_LAYOUT_META,
  WIDGET_LAYOUTS,
} from "../../shared/widget-config.js";
import { Brand } from "../components/brand.js";
import { CurrencySelect } from "../components/currency-select.js";
import { WidgetRenderer } from "../components/widget-renderer.js";
import { useCurrencies, useLivePrice, usePriceHistory } from "../hooks/use-market.js";
import { formatRelativeTime } from "../lib/format.js";
import { layoutSupportsChart } from "../../shared/widget-config.js";

interface StudioState {
  activeTab: "preview" | "embed" | "obs" | "share";
  mode: WidgetMode;
  drafts: Record<WidgetMode, WidgetConfig>;
}

type CopyState = "iframe" | "obs-url" | "direct-url" | "markdown" | "error" | null;

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

  function switchMode(newMode: WidgetMode) {
    setStudioState((current) => ({
      ...current,
      mode: newMode,
    }));
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

  function renderLayoutIcon(layout: string) {
    switch (layout) {
      case "price":
        return (
          <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="8" width="36" height="8" rx="2" />
          </svg>
        );
      case "card":
        return (
          <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="6" y="2" width="28" height="20" rx="2" />
            <path d="M10 16l5-6 4 3 6-8" />
          </svg>
        );
      case "ticker":
        return (
          <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="9" width="38" height="6" rx="1" />
          </svg>
        );
      case "lower-third":
        return (
          <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="14" width="36" height="8" rx="1" />
            <path d="M4 14v8" />
          </svg>
        );
      case "corner":
        return (
          <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="22" y="2" width="16" height="10" rx="1" />
          </svg>
        );
      case "chart":
        return (
          <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="2" width="32" height="20" rx="2" />
            <path d="M8 16l6-7 5 4 8-9" />
          </svg>
        );
      default:
        return null;
    }
  }

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-preview">Skip to live preview</a>
      <header className="studio-header">
        <Brand compact />
        <h1 className="studio-header__title" translate="no">Widget Studio</h1>
        <a href="/" aria-label="Exit Studio">← Back to price</a>
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
          <div className="studio-workspace">
            <section className="studio-stage" aria-labelledby="preview-title">
              <div className="stage-bar">
                <span className={live ? "stage-live" : "stage-stale"}>
                  {live && "● "}{status} preview
                </span>
                {relativeTime && (
                  <span className="stage-meta">
                    Updated {relativeTime} · {config.currency} index
                  </span>
                )}
              </div>
              <div className={`preview-well`} data-mode={mode} id="studio-preview">
                <div className={`preview-widget preview-widget--${config.layout}`} style={previewStyle} data-layout={config.layout}>
                  <WidgetRenderer config={config} mode={mode} price={price} history={points} connectionState={connectionState} historyLoading={historyLoading} historyError={historyError} />
                </div>
              </div>
              <p className="preview-hint">
                {mode === "overlay" ? "Checkerboard = transparent OBS Browser Source" : "Solid stage for website embed"}
              </p>
            </section>

            <aside className="studio-rail" aria-label="Configure widget">
              <div className="rail-section">
                <h2 className="rail-title">Layout</h2>
                <div className="layout-grid">
                  {WIDGET_LAYOUTS.map((layout) => (
                    <button
                      key={layout}
                      aria-pressed={config.layout === layout}
                      type="button"
                      onClick={() => updateConfig("layout", layout)}
                      title={WIDGET_LAYOUT_META[layout].label}
                    >
                      {renderLayoutIcon(layout)}
                      <span>{WIDGET_LAYOUT_META[layout].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rail-section">
                <label className="rail-field">
                  <span className="rail-label">Currency</span>
                  <CurrencySelect currencies={currencies} value={config.currency} onChange={(value) => updateConfig("currency", value)} id="studio-currency" compact />
                </label>
              </div>

              <div className="rail-section">
                <label className="rail-field">
                  <span className="rail-label">Target</span>
                  <select
                    value={mode}
                    onChange={(e) => {
                      const newMode = e.target.value as WidgetMode;
                      switchMode(newMode);
                      updateConfig("background", newMode === "overlay" ? "transparent" : "solid");
                    }}
                  >
                    <option value="overlay">OBS overlay (transparent)</option>
                    <option value="embed">Website embed</option>
                  </select>
                </label>
              </div>

              <div className="export-dock">
                <h2 className="rail-title">Export</h2>
                <div className="export-meta">
                  <span>{dimensions.minWidth} × {dimensions.minHeight}</span>
                  <span>{mode === "overlay" ? "Browser Source" : "Embed"}</span>
                </div>
                <div className="export-url">{rendererUrl}</div>
                <button type="button" className="btn-copy" onClick={() => void copy(rendererUrl, mode === "overlay" ? "obs-url" : "iframe")}>
                  {copied === "iframe" || copied === "obs-url" ? "COPIED ✓" : mode === "overlay" ? "Copy OBS URL" : "Copy embed URL"}
                </button>
                <p className="export-hint">Primary export always visible in rail — never clipped under the fold.</p>
              </div>
            </aside>
          </div>
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
