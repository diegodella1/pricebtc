import { SiteHeader } from "../components/site-header.js";

export function MethodologyPage() {
  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="public-main">
        <article className="prose">
          <h1>Price Methodology</h1>

          <section>
            <h2>Overview</h2>
            <p>
              PRICEB.TC provides Bitcoin (BTC) spot price observations for informational purposes. Our pricing
              reflects real-time market data from established cryptocurrency exchanges.
            </p>
          </section>

          <section>
            <h2>Data Sources</h2>
            <p>Our price index aggregates data from the following venues:</p>
            <ul>
              <li>
                <strong>Coinbase Exchange</strong> — BTC-USD spot market
              </li>
              <li>
                <strong>Binance</strong> — BTCUSDT spot market (USD Tether proxy)
              </li>
            </ul>
            <p>
              <strong>Important:</strong> Binance pricing is based on USDT (Tether), which is a stablecoin pegged to
              USD. While USDT generally trades near 1:1 with USD, the peg is not guaranteed and may deviate during
              market stress. This introduces potential variance in our aggregated index.
            </p>
          </section>

          <section>
            <h2>Index Calculation</h2>
            <p>When the multi-venue index is enabled, we calculate a volume-weighted average price (VWAP) using:</p>
            <ul>
              <li>
                <strong>Last price</strong> from each venue
              </li>
              <li>
                <strong>24-hour quoted volume</strong> as the weighting factor
              </li>
            </ul>
            <p>
              The formula: <code>VWAP = Σ(price × volume) / Σ(volume)</code>
            </p>
          </section>

          <section>
            <h2>Outlier Detection</h2>
            <p>
              To maintain data quality, we exclude prices that diverge more than <strong>2%</strong> from the median of
              all healthy venues. Excluded venues are marked in the API response with an explanation.
            </p>
          </section>

          <section>
            <h2>Fallback &amp; Degraded Modes</h2>
            <ul>
              <li>
                <strong>Single-venue fallback:</strong> If only one venue is available, we report its price directly
                (not a multi-venue index). The API indicates this with <code>method: "single-venue-fallback"</code> and{" "}
                <code>degraded: true</code>.
              </li>
              <li>
                <strong>Stale hold:</strong> When no venues are available, we hold the last known good price for up to{" "}
                <strong>30 seconds</strong>, then mark the feed as stale or unavailable.
              </li>
            </ul>
          </section>

          <section>
            <h2>24-Hour Statistics</h2>
            <p>
              The 24-hour high, low, volume, and percent change displayed on PRICEB.TC are sourced from{" "}
              <strong>Coinbase Exchange</strong> only. These statistics are not aggregated across multiple venues.
            </p>
          </section>

          <section>
            <h2>Historical Data</h2>
            <p>
              Price history and charts display <strong>Coinbase</strong>-labeled data. Multi-venue historical
              aggregation is not currently available.
            </p>
          </section>

          <section>
            <h2>Foreign Exchange Conversion</h2>
            <p>
              Currency conversions (USD to EUR, GBP, etc.) use third-party foreign exchange rates. These rates are
              indicative and may not reflect the exact rate available at your financial institution. PRICEB.TC is not
              responsible for FX rate discrepancies.
            </p>
          </section>

          <section>
            <h2>Disclaimers</h2>
            <ul>
              <li>This service provides market observations, not financial advice or trading recommendations.</li>
              <li>
                Cryptocurrency prices are highly volatile and can change rapidly. Past performance does not indicate
                future results.
              </li>
              <li>PRICEB.TC makes no guarantees regarding price accuracy, availability, or suitability for trading.</li>
              <li>
                Always verify prices with your exchange or broker before making financial decisions. Use this data at
                your own risk.
              </li>
            </ul>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              For questions about our methodology, please refer to our <a href="/faq">FAQ</a> or{" "}
              <a href="/about">About</a> page.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
