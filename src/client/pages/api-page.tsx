import { useEffect, useState } from "react";
import { SiteHeader } from "../components/site-header.js";
import siteContent from "../../shared/site-content.json";

type Currency = "USD" | "ARS" | "BRL" | "MXN";

interface ApiResponse {
  asset: string;
  symbol: string;
  currency: string;
  price: string;
  priceUsd: string;
  change24h: number;
  high24h: string | null;
  low24h: string | null;
  volume24h: string | null;
  volume24hUsd?: string | null;
  marketTimestamp: string;
  receivedAt: string;
  fxUpdatedAt: string | null;
  status: string;
  source: string;
  sourceDetails: { name: string; market: string };
  provider: { name: string; url: string };
}

const CURRENCIES: Array<{ code: Currency; name: string; isLatAm: boolean }> = [
  { code: "USD", name: "US Dollar", isLatAm: false },
  { code: "ARS", name: "Argentine Peso", isLatAm: true },
  { code: "BRL", name: "Brazilian Real", isLatAm: true },
  { code: "MXN", name: "Mexican Peso", isLatAm: true },
];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Copy failed */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="copy-button"
      aria-label={label ?? "Copy to clipboard"}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function ApiPage() {
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("USD");
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/price?currency=${selectedCurrency}`);
        if (!response.ok) throw new Error("Failed to fetch price");
        const data = await response.json() as ApiResponse;
        if (mounted) {
          setApiData(data);
          setLastUpdate(new Date().toISOString());
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load price");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void fetchData();
    return () => { mounted = false; };
  }, [selectedCurrency]);

  const curlCommand = `curl "https://priceb.tc/api/price?currency=${selectedCurrency}"`;
  
  const nodeSnippet = `const response = await fetch(
  "https://priceb.tc/api/price?currency=${selectedCurrency}"
);
const data = await response.json();
console.log(\`BTC/${selectedCurrency}: \${data.price}\`);`;

  const pythonSnippet = `import requests

response = requests.get(
    "https://priceb.tc/api/price",
    params={"currency": "${selectedCurrency}"}
)
data = response.json()
print(f"BTC/{selectedCurrency}: {data['price']}")`;

  const selectedCurrencyInfo = CURRENCIES.find(c => c.code === selectedCurrency);
  const showFxDisclaimer = selectedCurrencyInfo?.isLatAm ?? false;

  const fieldsTable = [
    ["asset", "Asset name. Always \"Bitcoin\"."],
    ["symbol", "Asset symbol. Always \"BTC\"."],
    ["currency", "Display currency code (ISO 4217). USD, ARS, BRL, or MXN."],
    ["price", "Current price in the display currency. String for precision."],
    ["priceUsd", "Current price in USD. String for precision."],
    ["change24h", "24-hour price change percentage. Number."],
    ["high24h", "24-hour high price in display currency. String or null."],
    ["low24h", "24-hour low price in display currency. String or null."],
    ["volume24h", "24-hour trading volume in BTC. String or null."],
    ["volume24hUsd", "24-hour trading volume in USD. Only present when currency is USD."],
    ["marketTimestamp", "Exchange timestamp (ISO 8601). Use this to determine observation age."],
    ["receivedAt", "Service reception timestamp (ISO 8601)."],
    ["fxUpdatedAt", "FX rate update timestamp (ISO 8601) or null for USD."],
    ["status", "Data freshness: \"live\" (≤30s), \"stale\" (>30s), or \"unavailable\"."],
    ["source", "Legacy string may still read \"coinbase\"; clients should prefer method, degraded, and sources[] when present."],
    ["sourceDetails", "Object with name and market fields. See sources[] and /methodology for multi-venue details."],
    ["method", "When present, describes how the headline price was built (e.g., index, degraded)."],
    ["degraded", "When present and true, indicates fallback to a single venue."],
    ["sources[]", "When present, lists the venues contributing to the headline price with their weights."],
    ["provider", "Object with name \"PRICEB.TC\" and url \"https://priceb.tc/\"."],
  ];

  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content" className="public-main api-page">
        <section className="api-hero">
          <div className="api-hero__intro">
            <p className="section-kicker">BITCOIN PRICE API</p>
            <h1>Free JSON API</h1>
            <p className="api-hero__description">
              When the multi-venue index is on, the headline BTC/USD price is a disclosed two-venue index from Coinbase Exchange (BTC-USD) and Binance (BTCUSDT, treated as USDT≈USD), weighted by each venue's 24-hour volume. Other display currencies are indicative daily FX conversions. No API key is required.
            </p>
          </div>

          <div className="api-example">
            <div className="api-example__header">
              <h2>Get current price</h2>
              <CopyButton text={curlCommand} label="Copy curl command" />
            </div>
            <pre className="api-example__curl"><code>{curlCommand}</code></pre>
            
            <div className="api-response">
              <div className="api-response__tabs" role="tablist">
                {CURRENCIES.map(({ code }) => (
                  <button
                    key={code}
                    type="button"
                    role="tab"
                    aria-selected={selectedCurrency === code}
                    onClick={() => setSelectedCurrency(code)}
                    className="api-response__tab"
                  >
                    {code}
                  </button>
                ))}
              </div>
              
              {showFxDisclaimer && (
                <div className="api-disclaimer" role="status">
                  <strong>FX Conversion:</strong> {selectedCurrency} prices are indicative conversions from USD using daily exchange rates. Not financial advice.
                </div>
              )}

              <div className="api-response__body">
                {loading && <p className="api-loading">Loading live data…</p>}
                {error && <p className="api-error" role="alert">{error}</p>}
                {apiData && !loading && (
                  <>
                    <div className="api-response__meta">
                      <span>Live response</span>
                      <CopyButton text={JSON.stringify(apiData, null, 2)} />
                    </div>
                    <pre className="api-response__json"><code>{JSON.stringify(apiData, null, 2)}</code></pre>
                    {lastUpdate && (
                      <p className="api-response__timestamp">
                        Fetched: {new Date(lastUpdate).toLocaleString("en-US", { 
                          hour: "numeric", 
                          minute: "2-digit", 
                          second: "2-digit",
                          hour12: true 
                        })} · Market: {new Date(apiData.marketTimestamp).toLocaleString("en-US", { 
                          hour: "numeric", 
                          minute: "2-digit", 
                          second: "2-digit",
                          hour12: true 
                        })}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="api-section">
          <h2>Response fields</h2>
          <div className="api-fields">
            <table className="fields-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {fieldsTable.map(([field, description]) => (
                  <tr key={field}>
                    <td><code>{field}</code></td>
                    <td>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="api-section">
          <h2>Code examples</h2>
          
          <div className="code-example">
            <div className="code-example__header">
              <h3>Node.js / JavaScript</h3>
              <CopyButton text={nodeSnippet} label="Copy Node.js code" />
            </div>
            <pre className="code-example__snippet"><code>{nodeSnippet}</code></pre>
          </div>

          <div className="code-example">
            <div className="code-example__header">
              <h3>Python</h3>
              <CopyButton text={pythonSnippet} label="Copy Python code" />
            </div>
            <pre className="code-example__snippet"><code>{pythonSnippet}</code></pre>
          </div>
        </section>

        <section className="api-section">
          <h2>Freshness and errors</h2>
          <p>
            Responses use Cache-Control: no-store. Each request reads the latest in-memory observation; 
            it does not guarantee a new market trade. There is no single global Bitcoin price. 
            The index is not a world average — see <a href="/methodology">/methodology</a>.
          </p>
          <p>
            Snapshots older than <strong>30 seconds</strong>, or a degraded server feed, are stale. 
            Always inspect <code>marketTimestamp</code>.
          </p>
          <p>
            HTTP 400: INVALID_CURRENCY. HTTP 503: PRICE_UNAVAILABLE. Rate limiting can return HTTP 429; 
            back off before retrying.
          </p>
        </section>

        <section className="api-section">
          <h2>Rate limits</h2>
          <p>
            The free API allows <strong>120 requests per minute</strong> from each IP address. 
            Rate limit state is returned in response headers:
          </p>
          <ul className="header-list">
            <li><code>X-RateLimit-Limit</code> — Maximum requests allowed per window</li>
            <li><code>X-RateLimit-Remaining</code> — Requests remaining in current window</li>
            <li><code>X-RateLimit-Reset</code> — Unix timestamp when the window resets</li>
            <li><code>Retry-After</code> — Seconds to wait before retrying (on HTTP 429)</li>
          </ul>
        </section>

        <section className="api-section">
          <h2>Additional endpoints</h2>
          <ul className="api-links">
            <li>
              <a href="/api/price?currency=USD"><code>GET /api/price?currency=USD</code></a> — Current price observation
            </li>
            <li>
              <a href="/api/history?currency=USD&range=24h"><code>GET /api/history?currency=USD&range=24h</code></a> — Historical price data
            </li>
            <li>
              <a href="/api/currencies"><code>GET /api/currencies</code></a> — Supported currencies
            </li>
            <li>
              <a href="/api/stream?currency=USD"><code>GET /api/stream?currency=USD</code></a> — Server-sent events stream
            </li>
            <li>
              <a href="/healthz"><code>GET /healthz</code></a> — Service health check
            </li>
          </ul>
        </section>

        <section className="api-section">
          <h2>Documentation & resources</h2>
          <ul className="api-links">
            <li>
              <a href="/bitcoin-price.md">bitcoin-price.md</a> — Current price as Markdown
            </li>
            <li>
              <a href="/api/currencies">Supported currencies</a> — Available currency codes
            </li>
            <li>
              <a href="/methodology">Price methodology</a> — Source, updates and history
            </li>
            <li>
              <a href="/sponsors#claim">Claim a Top 21 sponsor slot</a> — Support PRICEB.TC
            </li>
          </ul>
        </section>

        <section className="api-section claim-block">
          <p className="claim-block__lead">Free utilities stay free. Visibility beside the live Bitcoin price is a crypto sponsorship.</p>
          <p><a className="action-link" href="/sponsors#claim">Claim a Top 21 sponsor slot →</a></p>
          <p><a href="/rules">Sponsor rules</a></p>
        </section>
      </main>
      <footer className="public-footer">
        <a href="/about">About</a>
        <a href="/faq">FAQ</a>
        <a href="/">PRICEB.TC</a>
        <a href="/rules">Sponsor rules</a>
        <a href={`mailto:${siteContent.contactEmail}`}>Contact</a>
      </footer>
    </div>
  );
}
