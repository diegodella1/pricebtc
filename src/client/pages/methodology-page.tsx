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
          <h1>How we price</h1>

          <p className="lead">
            PRICEB.TC publishes a <strong>BTC/USD index</strong> from <strong>Coinbase Exchange</strong> and{" "}
            <strong>Binance</strong> last prices, weighted by each venue's <strong>24-hour volume</strong>. It is a
            disclosed two-venue index — <strong>not</strong> a global average and <strong>not</strong> a claim of the
            "true" world price of Bitcoin.
          </p>

          <section id="venues">
            <h2>Venues we use</h2>
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Pair</th>
                  <th>Weight in v1</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Coinbase Exchange</td>
                  <td>BTC-USD</td>
                  <td>24h volume</td>
                  <td>Required USD spot leg</td>
                </tr>
                <tr>
                  <td>Binance</td>
                  <td>BTCUSDT</td>
                  <td>24h volume</td>
                  <td>
                    Required; <strong>USDT-linked</strong> USD proxy (see note below)
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              Kraken and other venues are <strong>not</strong> included in v1. Rolling 60-second trade-volume weights
              are <strong>not</strong> used in v1 (possible later).
            </p>
          </section>

          <section id="calculation">
            <h2>How the index is calculated</h2>
            <p>
              When both venues are healthy, the headline price is a <strong>last-price VWAP</strong>: each venue's{" "}
              <strong>last price</strong> weighted by that venue's <strong>24-hour quoted volume</strong> (
              <code>weightSource: "24h"</code> on every v1 source).
            </p>
            <p>Plain form:</p>
            <pre>
              <code>
                {`index = (last_coinbase × vol24h_coinbase + last_binance × vol24h_binance) / (vol24h_coinbase + vol24h_binance)`}
              </code>
            </pre>
            <p>(with Binance last price taken from BTCUSDT under the USDT≈USD assumption below).</p>
            <p>
              We recompute as venue ticks arrive and publish to the site and API at most about{" "}
              <strong>once per second</strong>.
            </p>
            <p>
              v1 does <strong>not</strong> use rolling 60-second trade volume for weights.
            </p>
          </section>

          <section id="usdt">
            <h2>Binance USDT note</h2>
            <p>
              The Binance leg is <strong>BTCUSDT</strong>, not BTC-USD. For the index we treat{" "}
              <strong>1 USDT ≈ 1 USD</strong>. USDT can trade slightly away from the US dollar; that difference can
              move the index a little versus a pure USD book. We show this clearly so the number stays honest.
            </p>
          </section>

          <section id="fallback">
            <h2>When a venue is down</h2>
            <table>
              <thead>
                <tr>
                  <th>Healthy venues</th>
                  <th>What you see</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Two</td>
                  <td>
                    Full index — labeled <strong>BTC/USD index (Coinbase + Binance)</strong>
                  </td>
                </tr>
                <tr>
                  <td>One</td>
                  <td>
                    That venue's last price only — labeled <strong>degraded</strong> (e.g. Coinbase only or Binance
                    only). We do <strong>not</strong> pretend a one-venue print is still a multi-venue VWAP.
                  </td>
                </tr>
                <tr>
                  <td>Zero</td>
                  <td>
                    We hold the <strong>last good index for up to 30 seconds</strong>, then mark the feed{" "}
                    <strong>stale / error</strong>. We never invent a number.
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="outlier">
            <h2>Outlier filter (2%)</h2>
            <p>
              If one venue's last price differs by <strong>more than 2%</strong> from the median of healthy venues, we{" "}
              <strong>exclude</strong> it for that tick and keep using the remaining healthy venue(s). The API can mark
              that source as excluded; the methodology stays the same.
            </p>
          </section>

          <section id="stale">
            <h2>Stale data (30 seconds)</h2>
            <p>
              If every venue feed fails, we keep showing the last good index for <strong>at most 30 seconds</strong>,
              then surface a stale/error state. We do not blend stale and fresh quotes into a silent average.
            </p>
          </section>

          <section id="ohlcv">
            <h2>24h stats on the home card (OHLCV)</h2>
            <p>
              The home card's <strong>24h change, high, low, and volume</strong> stay tied to{" "}
              <strong>Coinbase Exchange BTC-USD</strong> ticker/stats, even when the headline number is the two-venue
              index. They are <strong>not</strong> an index OHLC. We label them as Coinbase so the card does not
              pretend the whole strip is multi-venue.
            </p>
          </section>

          <section id="fx">
            <h2>Other currencies (FX)</h2>
            <p>
              Non-USD display currencies are <strong>indicative</strong> conversions (ExchangeRate-API), typically
              refreshed daily. They are not separate crypto spot markets.
            </p>
          </section>

          <section id="history">
            <h2>Price history</h2>
            <p>
              The chart and history endpoints remain <strong>Coinbase BTC-USD labeled</strong> (
              <code>source: "coinbase"</code>) until a dedicated multi-venue history series exists. Past candles are{" "}
              <strong>not</strong> relabeled as the index.
            </p>
          </section>

          <section id="api">
            <h2>API</h2>
            <p>
              The same observation is available at <a href="/api">/api</a> (<code>/api/price</code>,{" "}
              <code>/api/stream</code>, etc.). New fields such as <code>method</code>, <code>degraded</code>, and{" "}
              <code>sources[]</code> describe how the headline <code>price</code> was built. Clients that only read{" "}
              <code>price</code> keep working.
            </p>
          </section>

          <section>
            <h2>What we do not claim</h2>
            <p>
              We do <strong>not</strong> call this a global average, a world price, or the single true Bitcoin price.
              It is a <strong>two-venue BTC/USD index</strong> (last prices × <strong>24h volume</strong>) with
              explicit USDT, fallback, outlier, and stale rules — and Coinbase-labeled OHLCV/history until those series
              are multi-venue.
            </p>
          </section>

          <p className="methodology-updated">Methodology updated 2026-09-28</p>
        </article>
      </main>
    </div>
  );
}
