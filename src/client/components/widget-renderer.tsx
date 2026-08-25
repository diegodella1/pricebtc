import type { CSSProperties } from "react";

import type { HistoryPoint, PricePayload } from "../../shared/contracts.js";
import type { WidgetConfig, WidgetMode } from "../../shared/widget-config.js";
import type { ClientConnectionState } from "../hooks/use-market.js";
import { formatPercent, formatPrice } from "../lib/format.js";
import { PriceChart } from "./price-chart.js";

interface WidgetRendererProps {
  config: WidgetConfig;
  mode: WidgetMode;
  price: PricePayload | null;
  history: HistoryPoint[];
  connectionState: ClientConnectionState;
}

type WidgetStyles = CSSProperties & Record<`--${string}`, string>;

function getWidgetStyles(config: WidgetConfig): WidgetStyles {
  const isLight = config.theme === "light";
  const text = config.theme === "custom" ? config.text : isLight ? "101316" : "F5F2EA";
  const surface = config.theme === "custom" ? config.surface : isLight ? "F5F2EA" : "101316";
  return {
    "--widget-accent": `#${config.accent}`,
    "--widget-text": `#${text}`,
    "--widget-surface": config.background === "transparent" ? "transparent" : `#${surface}`,
    "--widget-scale": String(config.scale / 100),
  };
}

export function WidgetRenderer({ config, mode, price, history, connectionState }: WidgetRendererProps) {
  const live = price?.status === "live" && connectionState === "live";
  const positive = (price?.change24h ?? 0) >= 0;
  const compactChart = config.layout === "ticker" || config.layout === "corner";
  const chartVisible = config.showChart && config.layout !== "price" && config.layout !== "lower-third";

  return (
    <article
      className={`widget widget--${config.layout} widget--${mode} widget--font-${config.font} widget--${config.background}`}
      style={getWidgetStyles(config)}
      data-motion={config.motion}
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
          <span className={`widget__status${live ? " is-live" : " is-delayed"}`}>
            <i aria-hidden="true" /> {live ? "LIVE" : "DELAYED"}
          </span>
        </header>

        <div className="widget__signal" aria-hidden="true">
          <span />
        </div>

        <div className="widget__quote">
          <span className="widget__price">
            {price ? formatPrice(price.price, price.currency) : "—"}
          </span>
          {config.showChange && price ? (
            <span className={`widget__change${positive ? " is-positive" : " is-negative"}`}>
              {formatPercent(price.change24h)} <small>24H</small>
            </span>
          ) : null}
        </div>

        {chartVisible ? <PriceChart points={history} positive={positive} compact={compactChart} /> : null}

        <footer className="widget__footer">
          <span className="widget__source">
            <span>COINBASE</span>
            {config.currency !== "USD" ? <span>FX: EXCHANGERATE-API</span> : null}
          </span>
          <a href="https://priceb.tc" target="_blank" rel="noreferrer" aria-label="priceb.tc">
            PRICEB.TC
          </a>
        </footer>
      </div>
    </article>
  );
}
