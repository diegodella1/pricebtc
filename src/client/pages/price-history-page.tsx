import { SiteHeader } from "../components/site-header.js";
import { useEffect, useState, useMemo } from "react";

interface DailyCandle {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  avg: string | null;
  source: string;
  method: string;
  degraded: boolean;
}

type RangeOption = "7d" | "30d" | "launch";

const LAUNCH_DATE = "2026-08-25";

export function PriceHistoryPage() {
  const [candles, setCandles] = useState<DailyCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>("launch");
  const [fromDate, setFromDate] = useState(LAUNCH_DATE);
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchFrom, setSearchFrom] = useState(LAUNCH_DATE);
  const [searchTo, setSearchTo] = useState(new Date().toISOString().split("T")[0]);

  const launchDate = LAUNCH_DATE;
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/history?currency=USD&granularity=1d&since=launch`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status}`);
        }

        const data = await response.json();
        setCandles(data.points || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }

    void fetchHistory();
  }, []);

  const filteredCandles = useMemo(() => {
    if (!candles.length) return [];

    let filtered = candles;

    if (range === "7d") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoff = sevenDaysAgo.toISOString().split("T")[0];
      filtered = candles.filter((c) => c.date >= cutoff);
    } else if (range === "30d") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split("T")[0];
      filtered = candles.filter((c) => c.date >= cutoff);
    } else {
      filtered = candles.filter((c) => c.date >= fromDate && c.date <= toDate);
    }

    return filtered;
  }, [candles, range, fromDate, toDate]);

  const chartData = useMemo(() => {
    if (!filteredCandles.length) return { high: [], low: [], close: [] };

    return {
      high: filteredCandles.map((c) => Number(c.high)),
      low: filteredCandles.map((c) => Number(c.low)),
      close: filteredCandles.map((c) => Number(c.close)),
      dates: filteredCandles.map((c) => c.date),
    };
  }, [filteredCandles]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFromDate(searchFrom);
    setToDate(searchTo);
    setRange("launch");
  };

  const handleRangeChange = (newRange: RangeOption) => {
    setRange(newRange);
    if (newRange === "launch") {
      setFromDate(launchDate);
      setToDate(today);
    }
  };

  const formatPrice = (value: string) => {
    return `$${Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getRangeLabel = () => {
    if (range === "7d") return "Range: last 7 days";
    if (range === "30d") return "Range: last 30 days";
    return `Range: since launch (${launchDate} → ${today})`;
  };

  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="public-main price-history-page">
        <div className="shell">
          <p className="home-hint">
            ← <a href="/#market">Price history</a> on Home (1h / 24h / 7d) · this page
            = daily since launch
          </p>

          <div className="page-head">
            <div>
              <h1>Price history since launch</h1>
              <p className="page-sub">
                Daily BTC/USD OHLC from <strong>{launchDate} UTC</strong> → today.
                Search any date range; chart + table from PRICEB.TC-owned daily candles.
              </p>
            </div>
            <div className="chip-row">
              <span className="disclose" title="Methodology">
                <span className="dot" />
                Coinbase backfill + live rollup
              </span>
              <span className="disclose">granularity = 1d · UTC</span>
            </div>
          </div>

          <section className="panel" aria-label="Daily OHLC chart">
            <div className="panel-bar">
              <div>
                <h2>Daily high–low · close</h2>
                <div className="panel-meta">
                  {loading
                    ? "Loading..."
                    : error
                    ? "Error loading data"
                    : `${filteredCandles.length} candles · USD`}
                </div>
              </div>
              <div className="pills" role="group" aria-label="Chart range">
                <button
                  type="button"
                  data-range="7d"
                  aria-pressed={range === "7d"}
                  onClick={() => handleRangeChange("7d")}
                >
                  7d
                </button>
                <button
                  type="button"
                  data-range="30d"
                  aria-pressed={range === "30d"}
                  onClick={() => handleRangeChange("30d")}
                >
                  30d
                </button>
                <button
                  type="button"
                  data-range="launch"
                  aria-pressed={range === "launch"}
                  onClick={() => handleRangeChange("launch")}
                >
                  Since launch
                </button>
              </div>
            </div>
            <div className="chart" id="ohlc-chart">
              {loading ? (
                <div className="chart-loading">Loading chart...</div>
              ) : error ? (
                <div className="chart-error">Failed to load chart data</div>
              ) : (
                <SimpleChart data={chartData} />
              )}
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-band" /> Daily high–low band
              </span>
              <span>
                <i className="legend-close" /> Daily close
              </span>
              <span id="range-label">{getRangeLabel()}</span>
            </div>
          </section>

          <section className="panel" aria-label="Date search">
            <div className="panel-bar">
              <h2>Date search</h2>
              <span className="panel-meta">
                UTC calendar days · from ≥ launch
              </span>
            </div>
            <form className="search-row" onSubmit={handleSearch}>
              <label>
                From
                <input
                  type="date"
                  name="from"
                  value={searchFrom}
                  min={launchDate}
                  max={today}
                  onChange={(e) => setSearchFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  name="to"
                  value={searchTo}
                  min={launchDate}
                  max={today}
                  onChange={(e) => setSearchTo(e.target.value)}
                />
              </label>
              <button type="submit" className="btn-search">
                Search
              </button>
              <p className="search-hint">
                Filters table (and chart window) to the selected UTC dates. Launch
                floor: {launchDate}.
              </p>
            </form>
          </section>

          <section className="panel" aria-label="Daily OHLC table">
            <div className="panel-bar">
              <h2>Daily candles</h2>
              <span className="panel-meta">
                {loading
                  ? "Loading..."
                  : `Showing ${filteredCandles.length} rows · USD`}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th className="num">Open</th>
                    <th className="num">High</th>
                    <th className="num">Low</th>
                    <th className="num">Close</th>
                    <th className="num">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>Loading...</td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6}>{error}</td>
                    </tr>
                  ) : filteredCandles.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No data available for this range</td>
                    </tr>
                  ) : (
                    filteredCandles
                      .slice()
                      .reverse()
                      .map((candle) => (
                        <tr key={candle.date}>
                          <td>{candle.date}</td>
                          <td className="num">{formatPrice(candle.open)}</td>
                          <td className="num">{formatPrice(candle.high)}</td>
                          <td className="num">{formatPrice(candle.low)}</td>
                          <td className="num">{formatPrice(candle.close)}</td>
                          <td className="num">
                            {candle.avg ? formatPrice(candle.avg) : "—"}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && !error && filteredCandles.length > 0 && (
              <p className="table-foot">
                Showing {filteredCandles.length} daily rows (launch → today). Never
                invents prices.
              </p>
            )}
          </section>

          <aside className="callout" aria-label="Methodology">
            <h2>Methodology · honest disclosure</h2>
            <p>
              <strong>Backfill</strong> for pre- and early post-launch days uses{" "}
              <strong>Coinbase daily candles only</strong>. That is <em>not</em> a
              historical multi-venue VWAP index. Live site PRICE_INDEX (vwap env)
              applies to the current observation — not to this backfilled series.
            </p>
            <p>
              <strong>Ongoing rollup</strong> after launch stores PRICEB.TC-owned
              daily OHLC (+ optional avg) from the live feed / snapshot pipeline.
              When a day is degraded or source differs, the API exposes{" "}
              <code>source</code> / <code>method</code> / <code>degraded</code>.
            </p>
            <p>
              Full write-up:{" "}
              <a href="/methodology">
                /methodology
              </a>{" "}
              (Coinbase backfill ≠ multi-venue historical index).
            </p>
          </aside>
        </div>
      </main>
      <footer className="public-footer">
        <a href="/methodology">Methodology</a>
        <a href="/api">API</a>
        <a href="/#market">Home</a>
      </footer>
    </div>
  );
}

function SimpleChart({ data }: { data: { high: number[]; low: number[]; close: number[]; dates: string[] } }) {
  if (!data.high.length) {
    return <div className="chart-empty">No data to display</div>;
  }

  const maxPrice = Math.max(...data.high);
  const minPrice = Math.min(...data.low);
  const priceRange = maxPrice - minPrice;
  const padding = priceRange * 0.1;

  const toY = (price: number) => {
    return ((maxPrice + padding - price) / (priceRange + 2 * padding)) * 100;
  };

  const width = 100;
  const step = width / Math.max(1, data.high.length - 1);

  const highPath = data.high.map((h, i) => `${i * step},${toY(h)}`).join(" ");
  const lowPath = data.low
    .slice()
    .reverse()
    .map((l, i) => `${(data.low.length - 1 - i) * step},${toY(l)}`)
    .join(" ");
  const closePath = data.close.map((c, i) => `${i * step},${toY(c)}`).join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="price-chart-svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F7931A" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#F7931A" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <polygon
        fill="url(#bandFill)"
        stroke="none"
        points={`${highPath} ${lowPath}`}
      />
      <polyline
        fill="none"
        stroke="#F7931A"
        strokeWidth="0.3"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={closePath}
      />
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="0.1">
        <line x1="0" y1="25" x2="100" y2="25" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="75" x2="100" y2="75" />
      </g>
    </svg>
  );
}
