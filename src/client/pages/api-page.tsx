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
    ["status", "Data freshness: \"live\" (≤15s), \"stale\" (>15s), or \"unavailable\"."],
    ["source", "Data source. Always \"coinbase\"."],
    ["sourceDetails", "Object with name \"Coinbase Exchange\" and market \"BTC-USD\"."],
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
              Real-time Bitcoin price data. No API key required. The same observation powering PRICEB.TC, available as JSON.
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
                {CURRENCIES.map(({ code, name }) => (
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
          <h2>Rate limits & fair use</h2>
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
          <p>
            For real-time updates, use the SSE endpoint at <code>/api/stream?currency=USD</code> instead 
            of polling. This service is provided as-is for personal and commercial use. 
            For high-volume integrations or SLA guarantees, <a href="/pricing">contact us about Pro plans</a>.
          </p>
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
              <a href="/llms.txt">llms.txt</a> — LLM-readable project documentation
            </li>
            <li>
              <a href="/bitcoin-price.md">bitcoin-price.md</a> — Current price as Markdown
            </li>
            <li>
              <a href="/bitcoin-price-updates">Price source and methodology</a> — How we get the data
            </li>
            <li>
              <a href="/studio">Widget Studio</a> — Create embeddable widgets
            </li>
          </ul>
        </section>

        <section className="api-cta">
          <h2>Start building</h2>
          <p>
            Free for personal and commercial use. No API key required.
          </p>
          <div className="cta-buttons">
            <a href="/api/price?currency=USD" className="button button--primary">Get started free →</a>
            <a href={`mailto:${siteContent.contactEmail}`} className="button button--secondary">Contact for Pro plans</a>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <div>
          <a href="/" className="footer-wordmark">PRICEB.TC</a>
          <p>Bitcoin, in view.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/sponsors">Sponsor</a>
          <a href="/status">Status</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/studio">Studio</a>
          <a href="/about">About</a>
          <a href="/faq">FAQ</a>
          <a href="/api">API</a>
          <a href={`mailto:${siteContent.contactEmail}`}>Contact</a>
        </nav>
        <p>
          Indicative market data · Not financial advice · FX by{" "}
          <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
            ExchangeRate-API
          </a>
        </p>
      </footer>
    </div>
  );
}
