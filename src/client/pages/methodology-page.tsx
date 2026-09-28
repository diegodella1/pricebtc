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
            PRICEB.TC publishes a <strong>BTC/USD index</strong> built from live trades on{" "}
            <strong>Coinbase Exchange</strong> and <strong>Binance</strong>. It is a disclosed, volume-weighted
            combination of those venues — <strong>not</strong> a global average and <strong>not</strong> a claim of the
            "true" world price of Bitcoin.
          </p>

          <section id="venues">
            <h2>Venues we use</h2>
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Pair</th>
                  <th>Role in v1</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Coinbase Exchange</td>
                  <td>BTC-USD</td>
                  <td>Required USD spot leg</td>
                </tr>
                <tr>
                  <td>Binance</td>
                  <td>BTCUSDT</td>
                  <td>
                    Required; <strong>USDT-linked</strong> USD proxy (see note below)
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              Kraken and other venues are <strong>not</strong> included in v1.
            </p>
          </section>

          <section id="calculation">
            <h2>How the index is calculated</h2>
            <p>
              When both venues are healthy, the headline price is a <strong>volume-weighted average</strong> of their
              last prices. Each venue's weight comes from its <strong>24-hour quoted volume</strong>.
            </p>
            <p>Plain form:</p>
            <pre>
              <code>
                {`index = (price_coinbase × vol_coinbase + price_binance × vol_binance) / (vol_coinbase + vol_binance)`}
              </code>
            </pre>
            <p>(with Binance price taken from BTCUSDT under the USDT≈USD assumption below).</p>
            <p>
              We recompute as venue ticks arrive and publish to the site and API at most about <strong>once per second</strong>.
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
              The chart and history endpoints remain <strong>Coinbase BTC-USD labeled</strong> until a dedicated
              multi-venue history series exists. Past candles are not relabeled as the index.
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
              It is a <strong>two-venue, volume-weighted BTC/USD index</strong> with explicit fallback and disclosure
              rules.
            </p>
          </section>

          <p className="methodology-updated">Methodology updated 2026-09-28</p>
        </article>
      </main>
    </div>
  );
}
