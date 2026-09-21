import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../components/site-header.js";
import { CurrencySelect } from "../components/currency-select.js";
import { CurrencyChips } from "../components/currency-chips.js";
import { PriceChart } from "../components/price-chart.js";
import { WidgetDemo } from "../components/widget-demo.js";
import { useCurrencies, useLivePrice, usePriceHistory } from "../hooks/use-market.js";
import { IS_STATIC_BUILD } from "../lib/api.js";
import { formatPercent, formatPrice, formatPriceVariants, formatRelativeTime, formatVolume } from "../lib/format.js";
import { formatUtcDate, formatUtcTime, getMarketTelemetry } from "../lib/market-telemetry.js";
import { HISTORY_RANGES, type HistoryRange } from "../../shared/widget-config.js";
import siteContent from "../../shared/site-content.json";

const BidHome = lazy(() => import("../sats-bid/home.js"));
const CURRENCY_STORAGE_KEY = "pricebtc:preferences:v1";

function getInitialCurrency(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const urlCurrency = urlParams.get("currency");
  if (urlCurrency && /^[A-Z]{3}$/.test(urlCurrency.toUpperCase())) {
    return urlCurrency.toUpperCase();
  }
  return "USD";
}

export function HomePage() {
  const [currency, setCurrencyState] = useState(getInitialCurrency);
  const [range, setRange] = useState<HistoryRange>("24h");
  const { currencies } = useCurrencies();
  const { price, connectionState, error } = useLivePrice(currency);
  const { points, loading: historyLoading, error: historyError } = usePriceHistory(currency, range);
  const live = connectionState === "live" && price?.status === "live";
  const displayedPoints = useMemo(() => !price || !points.length ? points : [...points, { timestamp: price.marketTimestamp, price: price.price }], [points, price]);
  const telemetry = useMemo(() => getMarketTelemetry(displayedPoints), [displayedPoints]);
  const recordedVolume = useMemo(() => {
    const recorded = points.filter(point => point.buyVolume != null && point.sellVolume != null);
    if (!recorded.length) return null;
    return {
      buy: recorded.reduce((sum, point) => sum + Number(point.buyVolume), 0).toLocaleString("en-US", { maximumFractionDigits: 4 }),
      sell: recorded.reduce((sum, point) => sum + Number(point.sellVolume), 0).toLocaleString("en-US", { maximumFractionDigits: 4 }),
    };
  }, [points]);
  const formatted = price ? formatPriceVariants(price.price, currency) : null;
  const status = live ? "Live" : connectionState === "connecting" ? "Connecting" : price ? "Stale" : "Unavailable";
  const relativeTime = price ? formatRelativeTime(price.marketTimestamp) : null;
  const satsPerDollar = price && Number(price.priceUsd) > 0 ? Math.round(100_000_000 / Number(price.priceUsd)).toLocaleString("en-US") : "—";
  const volume24hDisplay = price?.volume24h ? `${Number(price.volume24h).toFixed(2)} BTC` : "—";
  const volume24hUsdDisplay = price?.volume24hUsd ? `$${Number(price.volume24hUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : null;
  
  const isIndicative = currencies.find((c) => c.code === currency)?.indicative ?? false;

  function setCurrency(value: string) {
    setCurrencyState(value);
    const url = new URL(window.location.href);
    url.searchParams.set("currency", value);
    window.history.pushState({}, "", url.toString());
    try { localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify({ currency: value })); } catch { /* Optional preference. */ }
  }

  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCurrency = urlParams.get("currency");
      if (urlCurrency && /^[A-Z]{3}$/.test(urlCurrency.toUpperCase())) {
        setCurrencyState(urlCurrency.toUpperCase());
      } else {
        setCurrencyState("USD");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  return <div className="public-site">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <SiteHeader />
    <main id="main-content" className="public-main">
      <section id="market" className="price-section" aria-labelledby="hero-title">
        <div className="market-toolbar">
          <h1 id="hero-title">Bitcoin price now</h1>
          <div className="market-status">
            <span className={`feed-state${live ? " is-live" : ""}`} role="status"><i aria-hidden="true" />{status}</span>
            {relativeTime && <span className="market-time" title={price?.marketTimestamp}>Updated {relativeTime} · Coinbase BTC-USD</span>}
          </div>
        </div>
        <p className="market-subtitle">One exchange observation, not a global index. <a href="/bitcoin-price-updates">Source and methodology</a></p>
        <CurrencyChips value={currency} onChange={setCurrency} currencies={currencies} />
        {isIndicative && (
          <p className="currency-disclaimer" role="note">
            {currency} prices use indicative exchange rates from USD. Not financial advice.
          </p>
        )}
        <div className="price-module">
          <div className="price-sponsor-grid">
            <div className="price-primary">
              <div className="quote-label"><span>BTC / {currency}</span><span>Coinbase Exchange</span></div>
              <p className={`hero__price${formatted ? ` hero__price--${formatted.length}` : ""}`} role="group" aria-label={formatted ? `Bitcoin price ${formatted.exact}` : "Bitcoin price loading"} title={formatted?.exact}>
                {formatted ? <><span className="hero__price-exact">{formatted.exact}</span><span className="hero__price-compact" aria-hidden="true">{formatted.compact}</span></> : "—"}
              </p>
              <div className="quote-context"><span className={price && live ? price.change24h >= 0 ? "is-positive" : "is-negative" : ""}>{price ? formatPercent(price.change24h) : "—"} <small>24h</small></span><span>1 USD = <strong>{satsPerDollar}</strong> sats</span></div>
              <CurrencySelect currencies={currencies} value={currency} onChange={setCurrency} id="home-currency" />
              {error && <p className="public-notice" role="status">{error}</p>}
            </div>
            <aside id="bid-top-slot" aria-label="Sponsor space"><a href="/sponsors" className="sponsor-empty-cta"><h3 className="sponsor-empty-cta__title">Sponsor space</h3><p className="sponsor-empty-cta__desc">Rank beside Bitcoin</p><span className="sponsor-empty-cta__button">Bid from 1,000 sats</span></a></aside>
          </div>
          <div className="kpi-strip">
            <div className="kpi-item"><span className="kpi-label">High 24h</span><strong className="kpi-value">{price?.high24h ? formatPrice(price.high24h, currency) : "—"}</strong></div>
            <div className="kpi-item"><span className="kpi-label">Low 24h</span><strong className="kpi-value">{price?.low24h ? formatPrice(price.low24h, currency) : "—"}</strong></div>
            <div className="kpi-item"><span className="kpi-label">Volume 24h</span><strong className="kpi-value">{formatVolume(price?.volume24h ?? null)}</strong></div>
          </div>
          <div className="price-chart-block">
            <div className="chart-toolbar">
              <div className="pill-controls" role="group" aria-label="Chart range">{HISTORY_RANGES.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value.toUpperCase()}</button>)}</div>
            </div>
            <div className="hero__chart"><PriceChart points={displayedPoints} positive={(telemetry?.changePercent ?? 0) >= 0} showVolume={currency === "USD"} loading={historyLoading} error={historyError} /></div>
          {currency === "USD" && <div className="volume-legend" aria-label="Volume legend">
            <span className="volume-legend__buy">Recorded buys: {recordedVolume ? `${recordedVolume.buy} BTC` : "—"}</span><span className="volume-legend__sell">Recorded sells: {recordedVolume ? `${recordedVolume.sell} BTC` : "—"}</span><span className="volume-legend__unknown">Unclassified</span>
            <p>BTC volume by initiating side on Coinbase. Grey volume has no recorded split; older intervals and gaps may be incomplete. <a href="/bitcoin-price-updates">How it works</a></p>
          </div>}
            {historyError && points.length > 0 && <p className="public-notice" role="status">History updates delayed.</p>}
            <div className="history-summary"><span>{range.toUpperCase()} WINDOW</span><span>High <strong>{telemetry ? formatPrice(String(telemetry.high), currency) : "—"}</strong></span><span>Low <strong>{telemetry ? formatPrice(String(telemetry.low), currency) : "—"}</strong></span><span>Change <strong>{telemetry?.changePercent == null ? "—" : formatPercent(telemetry.changePercent)}</strong></span></div>
            <details className="feed-details"><summary>About this price</summary><p>{siteContent.home.priceExplanation}</p><dl><div><dt>Connection</dt><dd>{connectionState}</dd></div><div><dt>Market update</dt><dd>{formatUtcTime(price?.marketTimestamp ?? null)}</dd></div><div><dt>Received</dt><dd>{formatUtcTime(price?.receivedAt ?? null)}</dd></div><div><dt>FX updated</dt><dd>{currency === "USD" ? "Direct USD price" : formatUtcDate(price?.fxUpdatedAt ?? null)}</dd></div></dl></details>
          </div>
        </div>
        <p className="observation-description">{siteContent.home.observationDescription} <a href="/api">Bitcoin Price API</a> · <a href="/bitcoin-price-updates">Price source and methodology</a></p>
        <div className="market-ctas">
          <a href="/api/price?currency=USD" className="market-cta">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 10h14M3 5h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Get price as JSON</span>
          </a>
          <a href="/studio" className="market-cta">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M6 10h8M10 6v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Create a widget</span>
          </a>
        </div>
      </section>
      <WidgetDemo price={price} history={displayedPoints} connectionState={connectionState} currency={currency} range={range} loading={historyLoading} error={historyError} />
      {!IS_STATIC_BUILD && <Suspense fallback={<div className="sponsor-presentation-loading" role="status">Loading sponsor information…</div>}><BidHome /></Suspense>}
      <section className="public-section faq-section" id="data" aria-labelledby="faq-title"><div className="section-intro"><div><p className="section-kicker">Good to know</p><h2 id="faq-title">Simple tools. Clear sources.</h2></div><p>Live Bitcoin prices for the people watching, building and broadcasting.</p></div>
        <details><summary>Is PRICEB.TC free?</summary><p>Yes. Create and publish widgets without an account. Sponsorship is optional and separate.</p></details>
        <details><summary>Does it work with OBS and Streamlabs?</summary><p>Use the overlay URL as a Browser Source with a transparent background. Customize it in the Studio.</p></details>
        <details><summary>Why not Binance or Lemon?</summary><p>This service uses Coinbase BTC-USD only. ARS, BRL, and MXN prices are indicative conversions from USD using daily exchange rates. This is not financial advice.</p></details>
        <details><summary>How do sponsors work?</summary><p>One paid space beside the price. Once Lightning payments open, confirmed payments add to a participant’s daily total. The highest total leads until someone outbids it. Rounds reset at 00:00 UTC. <a href="/rules">Read the rules ↗</a></p></details>
      </section>
    </main>
    <footer className="public-footer"><div><a href="/" className="footer-wordmark">PRICEB.TC</a><p>Bitcoin, in view.</p></div><nav aria-label="Footer navigation"><a href="/sponsors">Sponsor</a><a href="/status">Status</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/studio">Studio</a><a href="/about">About</a><a href="/faq">FAQ</a><a href="/api">API</a><a href={`mailto:${siteContent.contactEmail}`}>Contact</a></nav><p>Indicative market data · Not financial advice · FX by <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a></p></footer>
  </div>;
}
