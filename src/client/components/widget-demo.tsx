import type { ClientConnectionState } from "../hooks/use-market.js";
import { useState } from "react";
import type { HistoryPoint, PricePayload } from "../../shared/contracts.js";
import { DEFAULT_EMBED_CONFIG, DEFAULT_OVERLAY_CONFIG, WIDGET_LAYOUT_META, type HistoryRange, type WidgetMode } from "../../shared/widget-config.js";
import { widgetExport, writeClipboard } from "../lib/widget-export.js";
import { WidgetRenderer } from "./widget-renderer.js";

export function WidgetDemo({ price, history, connectionState, currency, range, loading, error }: {
  price: PricePayload | null; history: HistoryPoint[]; connectionState: ClientConnectionState; currency: string; range: HistoryRange; loading: boolean; error: string | null;
}) {
  const [mode, setMode] = useState<WidgetMode>("overlay");
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const config = { ...(mode === "overlay" ? DEFAULT_OVERLAY_CONFIG : DEFAULT_EMBED_CONFIG), currency, range };
  const output = widgetExport(config, mode);
  const value = mode === "overlay" ? output.url : output.code;
  const meta = WIDGET_LAYOUT_META[config.layout];
  async function copy() {
    try { await writeClipboard(value); setCopied("ok"); } catch { setCopied("error"); }
  }
  return <section className="public-section widget-demo" id="formats" aria-labelledby="widgets-title">
    <div className="section-intro"><div><p className="section-kicker">Free · No account</p><h2 id="widgets-title">Bitcoin. On your screen.</h2></div><p>A live price for your website or stream. Choose a format, copy it, make it yours.</p></div>
    <div className="demo-controls"><div className="pill-controls" role="group" aria-label="Widget destination">
      {(["overlay", "embed"] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} onClick={() => { setMode(item); setCopied(null); }}>{item === "overlay" ? "OBS overlay" : "Website widget"}</button>)}
    </div><span>{meta.label} · Minimum {meta.minWidth} × {meta.minHeight} px</span></div>
    <div className={`demo-stage demo-stage--${mode}`}><span className="demo-stage-label">Actual widget preview</span><div className="demo-renderer" style={{ aspectRatio: meta.aspectRatio }}>
      <WidgetRenderer config={config} mode={mode} price={price} history={history} connectionState={connectionState} historyLoading={loading} historyError={error} />
    </div></div>
    <p className="demo-instruction">{mode === "overlay" ? "In OBS, add a Browser Source and paste this URL. Use a 1920 × 1080 canvas; the background stays transparent." : "Paste this iframe into your website’s HTML. The price updates automatically."}</p>
    <div className="demo-export"><label><span>{mode === "overlay" ? "OBS source URL" : "Website embed code"}</span><textarea rows={2} readOnly value={value} onFocus={event => event.target.select()} /></label><button type="button" className="action-link" onClick={() => void copy()}>{mode === "overlay" ? "Copy OBS URL" : "Copy embed code"}</button></div>
    <div className="demo-footer"><p role="status">{copied === "ok" ? "Copied to clipboard." : copied === "error" ? "Could not copy. Select the field above and copy manually." : "Six layouts. Your colors. Your currency."}</p><a href={`/studio?mode=${mode}&${output.query}`}>Customize in Studio ↗</a></div>
  </section>;
}
