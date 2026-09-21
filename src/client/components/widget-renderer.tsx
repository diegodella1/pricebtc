import type { CSSProperties } from "react";

import type { HistoryPoint, PricePayload } from "../../shared/contracts.js";
import { layoutSupportsChart, type WidgetConfig, type WidgetMode } from "../../shared/widget-config.js";
import type { ClientConnectionState } from "../hooks/use-market.js";
import { getContrastResult } from "../lib/color-contrast.js";
import { formatPercent, formatPriceVariants } from "../lib/format.js";
import { PriceChart } from "./price-chart.js";

interface WidgetRendererProps {
  config: WidgetConfig;
  mode: WidgetMode;
  price: PricePayload | null;
  history: HistoryPoint[];
  connectionState: ClientConnectionState;
  historyLoading?: boolean;
  historyError?: string | null;
}

type WidgetStyles = CSSProperties & Record<`--${string}`, string>;

function getWidgetStyles(config: WidgetConfig): WidgetStyles {
  const isLight = config.theme === "light";
  const text = config.theme === "custom" ? config.text : isLight ? "002B36" : "FDF6E3";
  const surface = config.theme === "custom" ? config.surface : isLight ? "FDF6E3" : "002B36";
  const readableAccent = config.theme === "custom"
    ? getContrastResult(config.accent, surface).passesAa ? config.accent : text
    : isLight ? "A63C10" : "E66B35";
  return {
    "--widget-accent": `#${config.accent}`,
    "--widget-accent-readable": `#${readableAccent}`,
    "--widget-text": `#${text}`,
    "--widget-surface": config.background === "transparent" ? "transparent" : `#${surface}`,
    "--widget-scale": String(config.scale / 100),
  };
}

function getConnectionStatus(price: PricePayload | null, connectionState: ClientConnectionState) {
  if (!price && (connectionState === "connecting" || connectionState === "live")) {
    return { label: "SYNCING", state: "syncing" } as const;
  }
  if (connectionState === "stopped" || connectionState === "unavailable" || !price || price.status === "unavailable") {
    return { label: "OFFLINE", state: "offline" } as const;
  }
  if (price.status === "live" && connectionState === "live") return { label: "LIVE", state: "live" } as const;
  return { label: "DELAYED", state: "delayed" } as const;
}

export function WidgetRenderer({
  config,
  mode,
  price,
  history,
  connectionState,
  historyLoading = false,
  historyError = null,
}: WidgetRendererProps) {
  const status = getConnectionStatus(price, connectionState);
  const positive = (price?.change24h ?? 0) >= 0;
  const compactChart = config.layout === "ticker" || config.layout === "corner";
  const chartVisible = config.showChart && layoutSupportsChart(config.layout);
  const formattedPrice = price ? formatPriceVariants(price.price, price.currency) : null;
  const priceFallback = status.state === "syncing" ? "SYNCING…" : "PRICE UNAVAILABLE";
  const priceLabel = formattedPrice ? `Bitcoin price ${formattedPrice.exact}` : status.state === "syncing" ? "Bitcoin price syncing" : "Bitcoin price unavailable";

  return (
    <article
      className={`widget widget--${config.layout} widget--${mode} widget--theme-${config.theme} widget--font-${config.font} widget--${config.background}`}
      style={getWidgetStyles(config)}
      data-motion={config.motion}
      data-state={status.state}
      data-scale-band={config.scale >= 150 ? "high" : config.scale >= 120 ? "raised" : "normal"}
    >
      <div className="widget__frame">
        <header className="widget__header">
          <span className="widget__asset">
            <span className="widget__coin" aria-hidden="true">
              ₿
            </span>
            <span>
              <strong>BITCOIN</strong>
              <small>BTC / {config.currency}</small>
            </span>
          </span>
          <span className={`widget__status is-${status.state}`} role="status">
            <i aria-hidden="true" /> {status.label}
          </span>
        </header>

        <div className="widget__signal" aria-hidden="true">
          <span />
        </div>

        <div className="widget__quote">
          <span
            className="widget__price"
            role="group"
            aria-label={priceLabel}
            data-price-length={formattedPrice?.length ?? "long"}
            title={formattedPrice?.exact}
          >
            <span className="widget__price-exact" aria-hidden="true">{formattedPrice?.exact ?? priceFallback}</span>
            <span className="widget__price-compact" aria-hidden="true">{formattedPrice?.compact ?? priceFallback}</span>
          </span>
          {config.showChange && price ? (
            <span className={`widget__change${positive ? " is-positive" : " is-negative"}`}>
              {formatPercent(price.change24h)} <small>24H</small>
            </span>
          ) : null}
        </div>

        {chartVisible ? (
          <PriceChart
            points={history}
            positive={positive}
            compact={compactChart}
            showVolume={config.showVolume && config.currency === "USD"}
            loading={historyLoading}
            error={historyError}
          />
        ) : null}

        <footer className="widget__footer">
          <span className="widget__source">
            <span>COINBASE</span>
            {config.currency !== "USD" ? <span>FX: EXCHANGERATE-API</span> : null}
          </span>
          <a href="https://priceb.tc/" target="_blank" rel="noreferrer" aria-label="Bitcoin price by PRICEB.TC" title="Bitcoin price by PRICEB.TC" translate="no">
            PRICEB.TC
          </a>
        </footer>
      </div>
    </article>
  );
}
