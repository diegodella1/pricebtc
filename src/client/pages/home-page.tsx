import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../components/site-header.js";
import { CurrencyChips } from "../components/currency-chips.js";
import { PriceChart } from "../components/price-chart.js";
import { useCurrencies, useLivePrice, usePriceHistory } from "../hooks/use-market.js";
import { useAnalytics } from "../hooks/use-analytics.js";
import { IS_STATIC_BUILD } from "../lib/api.js";
import { bidApi } from "../sats-bid/api.js";
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
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const { currencies } = useCurrencies();
  const { price, connectionState, error } = useLivePrice(currency);
  const { points, loading: historyLoading, error: historyError } = usePriceHistory(currency, range);
  const { stats } = useAnalytics();
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
  const isIndicative = currencies.find((c) => c.code === currency)?.indicative ?? false;

  const isIndexMode = price?.method === "vwap" || price?.method === "single-venue-fallback";
  const isFullIndex = price?.method === "vwap" && !price?.degraded;
  const isDegraded = price?.degraded === true;
  const coinbaseOnly = isDegraded && price?.sources?.some((s) => s.id === "coinbase" && s.ok);
  const binanceOnly = isDegraded && price?.sources?.some((s) => s.id === "binance" && s.ok);

  let quoteLabel = { primary: "BTC / USD", secondary: "Coinbase Exchange" };
  let venueFragment = "Coinbase BTC-USD";
  let marketSubtitle = "One exchange observation, not a global index.";
  let observationDesc = "PRICEB.TC provides a timestamped Bitcoin price sourced from Coinbase Exchange. The current observation is also available through the public JSON API.";
  let feedDetailsExplanation = siteContent.home.priceExplanation;

  if (isIndexMode) {
    feedDetailsExplanation = "The headline number is a last-price index of Coinbase BTC-USD and Binance BTCUSDT weighted by 24h volume when both feeds are healthy. If only one venue is healthy, we show that venue's last price and mark the index degraded. The card's 24h high/low/change/volume remain Coinbase stats. Non-USD currencies are indicative conversions; FX rates refresh daily.";
    
    if (isFullIndex) {
      quoteLabel = { primary: "BTC/USD index (Coinbase + Binance)", secondary: "" };
      venueFragment = "Coinbase BTC-USD + Binance BTCUSDT";
      marketSubtitle = "Volume-weighted index from two venues.";
      observationDesc = "PRICEB.TC shows a BTC/USD index from Coinbase Exchange (BTC-USD) and Binance (BTCUSDT, treated as USD), weighted by 24h volume. The same observation is available through the public JSON API.";
    } else if (coinbaseOnly) {
      quoteLabel = { primary: "BTC/USD · Coinbase only (index degraded)", secondary: "" };
      venueFragment = "Coinbase BTC-USD only";
      marketSubtitle = "Index degraded to single venue.";
      observationDesc = "PRICEB.TC shows a BTC/USD index from Coinbase Exchange (BTC-USD) and Binance (BTCUSDT, treated as USD), weighted by 24h volume. The same observation is available through the public JSON API.";
    } else if (binanceOnly) {
      quoteLabel = { primary: "BTC/USD · Binance only (index degraded)", secondary: "" };
      venueFragment = "Binance BTCUSDT only (USDT≈USD)";
      marketSubtitle = "Index degraded to single venue.";
      observationDesc = "PRICEB.TC shows a BTC/USD index from Coinbase Exchange (BTC-USD) and Binance (BTCUSDT, treated as USD), weighted by 24h volume. The same observation is available through the public JSON API.";
    }
  }

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

  useEffect(() => {
    if (IS_STATIC_BUILD) return;
    async function checkCryptoConfig() {
      try {
        const config = await bidApi<{ enabled: boolean; assets: { type: string }[] }>(
          "/crypto-sponsors/config",
          { method: "GET" }
        );
        setCryptoEnabled(config.enabled && config.assets.length > 0);
      } catch {
        setCryptoEnabled(false);
      }
    }
    void checkCryptoConfig();
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
            {relativeTime && <span className="market-time" title={price?.marketTimestamp}>Updated {relativeTime} · {venueFragment}</span>}
          </div>
        </div>
        <p className="market-subtitle">{marketSubtitle} <a href="/methodology">Source and methodology</a></p>
        <CurrencyChips value={currency} onChange={setCurrency} currencies={currencies} />
        {isIndicative && (
          <p className="currency-disclaimer" role="note">
            {currency} prices use indicative exchange rates from USD. Not financial advice.
          </p>
        )}
        <div className="price-module">
          <div className="price-sponsor-grid">
            <div className="price-primary">
              <div className="quote-label">
                <span>{currency === "USD" ? quoteLabel.primary : `BTC / ${currency}`}</span>
                {quoteLabel.secondary && <span>{quoteLabel.secondary}</span>}
              </div>
              <p className={`hero__price${formatted ? ` hero__price--${formatted.length}` : ""}`} role="group" aria-label={formatted ? `Bitcoin price ${formatted.exact}` : "Bitcoin price loading"} title={formatted?.exact}>
                {formatted ? <><span className="hero__price-exact">{formatted.exact}</span><span className="hero__price-compact" aria-hidden="true">{formatted.compact}</span></> : "—"}
              </p>
              {isIndexMode && currency === "USD" && (
                <p className="price-method-link">
                  <a href="/methodology">How we price</a>
                </p>
              )}
              <div className="quote-context"><span className={price && live ? price.change24h >= 0 ? "is-positive" : "is-negative" : ""}>{price ? formatPercent(price.change24h) : "—"} <small>24h</small></span><span>1 USD = <strong>{satsPerDollar}</strong> sats</span></div>
              {error && <p className="public-notice" role="status">{error}</p>}
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
                <p>BTC volume by initiating side on Coinbase. Grey volume has no recorded split; older intervals and gaps may be incomplete. <a href="/methodology">How it works</a></p>
              </div>}
                {historyError && points.length > 0 && <p className="public-notice" role="status">History updates delayed.</p>}
                <div className="history-summary"><span>{range.toUpperCase()} WINDOW</span><span>High <strong>{telemetry ? formatPrice(String(telemetry.high), currency) : "—"}</strong></span><span>Low <strong>{telemetry ? formatPrice(String(telemetry.low), currency) : "—"}</strong></span><span>Change <strong>{telemetry?.changePercent == null ? "—" : formatPercent(telemetry.changePercent)}</strong></span></div>
                <details className="feed-details"><summary>About this price</summary><p>{feedDetailsExplanation}{isIndexMode && <> Full rules: <a href="/methodology">How we price</a>.</>}</p><dl><div><dt>Connection</dt><dd>{connectionState}</dd></div><div><dt>Market update</dt><dd>{formatUtcTime(price?.marketTimestamp ?? null)}</dd></div><div><dt>Received</dt><dd>{formatUtcTime(price?.receivedAt ?? null)}</dd></div><div><dt>FX updated</dt><dd>{currency === "USD" ? "Direct USD price" : formatUtcDate(price?.fxUpdatedAt ?? null)}</dd></div></dl></details>
              </div>
            </div>
            <aside id="bid-top-slot" aria-label="Sponsor space"></aside>
          </div>
        </div>
        <section className="free-util" aria-label="Free Bitcoin overlay and embed">
          <div className="free-util__content">
            <p className="free-util__eyebrow">Free · no account</p>
            <p className="free-util__title">Free BTC overlay & embed for streams</p>
            <p className="free-util__desc">Same live PRICEB.TC observation — drop into OBS or any site. Sponsorship is separate Soft-OPEN crypto.</p>
          </div>
          <div className="free-util__links">
            <a href="/bitcoin-obs-overlay">OBS overlay →</a>
            <a href="/bitcoin-price-widget">Price widget / embed →</a>
          </div>
        </section>
        <aside id="bid-strip-slot" aria-label="Sponsor space #2"></aside>
        <div id="bid-logo-rail" className="bid-logo-rail" role="list" aria-label="Sponsor logo rail ranks 3 to 7"></div>
        <p className="observation-description">{observationDesc} <a href="/api">Bitcoin Price API</a> · <a href="/methodology">Price source and methodology</a></p>
        <div className="market-ctas">
          {cryptoEnabled && (
            <a href="/sponsors#claim" className="market-cta">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Claim a sponsor spot</span>
            </a>
          )}
          <a href="/api/price?currency=USD" className="market-cta market-cta--quiet">
            Get price as JSON
          </a>
        </div>
      </section>
      {!IS_STATIC_BUILD && <Suspense fallback={<div className="sponsor-presentation-loading" role="status">Loading sponsor space…</div>}><BidHome /></Suspense>}
      <section className="public-section faq-section" id="data" aria-labelledby="faq-title"><div className="section-intro"><div><p className="section-kicker">Good to know</p><h2 id="faq-title">Simple tools. Clear sources.</h2></div><p>Live Bitcoin prices for the people watching, building and broadcasting.</p></div>
        <details><summary>Is PRICEB.TC free?</summary><p>Yes. Create and publish widgets without an account. Sponsorship is optional and separate.</p></details>
        <details><summary>Does it work with OBS and Streamlabs?</summary><p>Use the overlay URL as a Browser Source with a transparent background. Customize it in the Studio.</p></details>
        <details><summary>Why not Binance or Lemon?</summary><p>This service uses Coinbase BTC-USD only. ARS, BRL, and MXN prices are indicative conversions from USD using daily exchange rates. This is not financial advice.</p></details>
        <details><summary>How do sponsors work?</summary><p>Five home placements: hero spot #1, strip #2, and logo rail ranks #3-7 below the chart, plus the Top 21 leaderboard. Ranked by cumulative USD. Crypto payments (USDT, USDC, BTC) add to your total. The highest totals take the spots until someone outbids. No daily resets. <a href="/sponsors#board">See leaderboard ↗</a></p></details>
      </section>
    </main>
    <footer className="public-footer"><div><a href="/" className="footer-wordmark">PRICEB.TC</a><p>Bitcoin price infrastructure.</p>{stats && Number.isFinite(stats.visitors) && <p className="footer-stats">{stats.visitors.toLocaleString()} visitors last 30 days</p>}</div><nav aria-label="Footer navigation"><a href="/sponsors#claim">Sponsors</a><a href="/api">API</a><a href="/status">Status</a><a href="/terms">Terms</a><a href={`mailto:${siteContent.contactEmail}`}>Contact</a></nav><p>Indicative market data · Not financial advice · FX by <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a></p></footer>
  </div>;
}
