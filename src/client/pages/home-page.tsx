import { useMemo, useState } from "react";

import { Brand } from "../components/brand.js";
import { CurrencySelect } from "../components/currency-select.js";
import { PriceChart } from "../components/price-chart.js";
import { useCurrencies, useLivePrice, usePriceHistory } from "../hooks/use-market.js";
import { formatPercent, formatPrice } from "../lib/format.js";
import { HISTORY_RANGES, type HistoryRange } from "../../shared/widget-config.js";

const CURRENCY_STORAGE_KEY = "pricebtc:preferences:v1";

function getInitialCurrency(): string {
  try {
    const stored = JSON.parse(localStorage.getItem(CURRENCY_STORAGE_KEY) ?? "null") as { currency?: unknown } | null;
    return typeof stored?.currency === "string" && /^[A-Z]{3}$/.test(stored.currency) ? stored.currency : "USD";
  } catch {
    return "USD";
  }
}

export function HomePage() {
  const [currency, setCurrencyState] = useState(getInitialCurrency);
  const [range, setRange] = useState<HistoryRange>("24h");
  const { currencies } = useCurrencies();
  const { price, connectionState } = useLivePrice(currency);
  const { points, loading: historyLoading } = usePriceHistory(currency, range);
  const positive = (price?.change24h ?? 0) >= 0;
  const live = connectionState === "live" && price?.status === "live";
  const displayedPoints = useMemo(() => {
    if (!price || points.length === 0) return points;
    return [...points, { timestamp: price.marketTimestamp, price: price.price }];
  }, [points, price]);

  function setCurrency(nextCurrency: string) {
    setCurrencyState(nextCurrency);
    localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify({ currency: nextCurrency }));
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand />
        <nav aria-label="Primary navigation">
          <a href="#formats">FORMATS</a>
          <a href="#data">DATA</a>
          <a className="button button--small button--light" href="/studio">
            BUILD A WIDGET <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__intro">
            <p className="eyebrow">
              <span>01</span> GLOBAL BITCOIN SIGNAL
            </p>
            <h1 id="hero-title">
              BITCOIN,
              <br />
              <em>RIGHT NOW.</em>
            </h1>
            <p className="hero__lede">
              One clear number. Live from Coinbase. Ready for every screen, website, and stream.
            </p>
          </div>

          <div className="hero__market">
            <div className="hero__market-topline">
              <span className={`live-label${live ? " is-live" : " is-delayed"}`}>
                <i aria-hidden="true" /> {live ? "LIVE MARKET" : "RECONNECTING"}
              </span>
              <span>BTC / {currency}</span>
            </div>

            <div className="hero__price-wrap">
              <div className="hero__pulse" aria-hidden="true">
                <span />
              </div>
              <p className="hero__price">
                {price ? formatPrice(price.price, currency) : "—"}
              </p>
              <div className="hero__price-meta">
                <span className={positive ? "is-positive" : "is-negative"}>
                  {price ? formatPercent(price.change24h) : "—"} <small>24H</small>
                </span>
                <span>LAST COINBASE TRADE</span>
              </div>
            </div>

            <div className="hero__controls">
              <CurrencySelect currencies={currencies} value={currency} onChange={setCurrency} id="home-currency" />
              <div className="range-field" aria-label="Chart range">
                <span>RANGE</span>
                <div>
                  {HISTORY_RANGES.map((rangeOption) => (
                    <button
                      key={rangeOption}
                      className={range === rangeOption ? "is-active" : ""}
                      type="button"
                      onClick={() => setRange(rangeOption)}
                    >
                      {rangeOption.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={`hero__chart${historyLoading ? " is-loading" : ""}`}>
              <PriceChart points={displayedPoints} positive={positive} />
              <div className="chart-grid" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="signal-strip" aria-label="Product capabilities">
          <span>LIVE BTC</span>
          <i aria-hidden="true">◆</i>
          <span>160+ FIAT CURRENCIES</span>
          <i aria-hidden="true">◆</i>
          <span>WEBSITE EMBEDS</span>
          <i aria-hidden="true">◆</i>
          <span>OBS OVERLAYS</span>
        </section>

        <section className="formats" id="formats" aria-labelledby="formats-title">
          <div className="section-heading">
            <p className="eyebrow">
              <span>02</span> TAKE THE SIGNAL
            </p>
            <h2 id="formats-title">BUILT TO LEAVE THIS PAGE.</h2>
          </div>

          <div className="format-grid">
            <article className="format-card format-card--embed">
              <div className="format-card__number">01 / WEB</div>
              <div className="mini-widget mini-widget--card" aria-hidden="true">
                <div><b>₿</b><span>BITCOIN<br /><small>BTC / USD</small></span></div>
                <strong>$104,250</strong>
                <i />
                <small>PRICEB.TC</small>
              </div>
              <h3>EMBED IT.</h3>
              <p>Responsive iframe widgets that stay current without touching your site again.</p>
              <a href="/studio?mode=embed">CREATE AN EMBED <span>↗</span></a>
            </article>

            <article className="format-card format-card--overlay">
              <div className="format-card__number">02 / STREAM</div>
              <div className="stream-frame" aria-hidden="true">
                <div className="stream-frame__person" />
                <div className="mini-widget mini-widget--lower">
                  <b>₿</b><span>BTC / USD<strong>$104,250</strong></span><em>+2.34%</em>
                </div>
              </div>
              <h3>STREAM IT.</h3>
              <p>Transparent browser-source overlays tuned for OBS and Streamlabs.</p>
              <a href="/studio?mode=overlay">CREATE AN OVERLAY <span>↗</span></a>
            </article>

            <article className="format-card format-card--control">
              <div className="format-card__number">03 / CONTROL</div>
              <div className="control-sample" aria-hidden="true">
                <span>ACCENT</span><i /><i /><i /><i />
                <span>SCALE</span><b><em /></b>
              </div>
              <h3>MAKE IT YOURS.</h3>
              <p>Six layouts, curated type, precise color, scale, motion, and transparent backgrounds.</p>
              <a href="/studio">OPEN THE STUDIO <span>↗</span></a>
            </article>
          </div>
        </section>

        <section className="data-note" id="data">
          <div>
            <p className="eyebrow">
              <span>03</span> SOURCE / METHOD
            </p>
            <h2>A NUMBER WITH A PROVENANCE.</h2>
          </div>
          <div className="data-note__copy">
            <p>
              BTC/USD is the latest public Coinbase Exchange trade. Other currencies use indicative USD
              conversion rates, refreshed daily and clearly timestamped.
            </p>
            <dl>
              <div><dt>MARKET</dt><dd>COINBASE EXCHANGE</dd></div>
              <div><dt>DELIVERY</dt><dd>SERVER-SENT EVENTS</dd></div>
              <div><dt>FX</dt><dd>EXCHANGERATE-API</dd></div>
            </dl>
          </div>
        </section>

        <section className="final-cta">
          <span className="final-cta__coin" aria-hidden="true">₿</span>
          <p>YOUR SCREEN.<br />THE LIVE SIGNAL.</p>
          <a className="button button--dark" href="/studio">BUILD IT FREE <span>↗</span></a>
        </section>
      </main>

      <footer className="site-footer">
        <Brand compact inverse />
        <p>INDICATIVE MARKET DATA · NOT FINANCIAL ADVICE</p>
        <p>FX BY <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">EXCHANGERATE-API</a></p>
      </footer>
    </div>
  );
}
