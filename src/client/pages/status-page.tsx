import { useState, useEffect } from "react";
import { SiteHeader } from "../components/site-header.js";
import { formatRelativeTime } from "../lib/format.js";

interface HealthCheck {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  memoryRssMb: number;
  market: { state: string; lastUpdateAt: string | null };
  fx: { state: string; updatedAt: string | null };
  streams: number;
}

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "outage";
  detail?: string;
}

export function StatusPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch("/healthz");
        if (!response.ok) throw new Error("Health check failed");
        const data = await response.json();
        setHealth(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch status");
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const services: ServiceStatus[] = health
    ? [
        {
          name: "Price Feed",
          status:
            health.market.state === "live"
              ? "operational"
              : health.market.state === "connecting"
                ? "degraded"
                : "outage",
          detail: health.market.lastUpdateAt
            ? `Last update: ${formatRelativeTime(health.market.lastUpdateAt)}`
            : undefined,
        },
        {
          name: "FX Rates",
          status:
            health.fx.state === "ready"
              ? "operational"
              : health.fx.state === "expired"
                ? "degraded"
                : "outage",
          detail: health.fx.updatedAt
            ? `Updated: ${formatRelativeTime(health.fx.updatedAt)}`
            : undefined,
        },
      ]
    : [];

  const overallStatus = loading
    ? "checking"
    : error
      ? "outage"
      : health
        ? health.status === "ok"
          ? "operational"
          : "degraded"
        : "checking";

  return (
    <div className="site-shell public-site">
      <SiteHeader />
      <main className="public-main status-page">
        <p className="section-kicker">SYSTEM STATUS</p>
        <h1>Service Health</h1>

        <div className="status-hero">
          <div className={`status-badge status-badge--${overallStatus}`}>
            {overallStatus === "checking" && "⋯ Checking Status"}
            {overallStatus === "operational" && "✓ All Systems Operational"}
            {overallStatus === "degraded" && "⚠ Degraded Performance"}
            {overallStatus === "outage" && "✗ Service Outage"}
          </div>
          {health && (
            <p className="status-uptime">
              Uptime: {formatUptime(health.uptimeSeconds)} · Memory: {health.memoryRssMb} MB
            </p>
          )}
        </div>

        {loading ? (
          <p className="status-loading" role="status">
            Checking system health...
          </p>
        ) : error ? (
          <div className="status-error" role="alert">
            <p>Unable to fetch system status</p>
            <p>{error}</p>
          </div>
        ) : (
          <div className="status-services">
            <h2>Service Components</h2>
            <div className="service-list">
              {services.map((service) => (
                <div key={service.name} className="service-item">
                  <div className="service-header">
                    <h3>{service.name}</h3>
                    <span className={`service-status service-status--${service.status}`}>
                      {service.status === "operational" && "Operational"}
                      {service.status === "degraded" && "Degraded"}
                      {service.status === "outage" && "Outage"}
                    </span>
                  </div>
                  {service.detail && <p className="service-detail">{service.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {health && health.streams > 0 && (
          <div className="status-metrics">
            <h2>Active Connections</h2>
            <p>
              {health.streams} live stream{health.streams !== 1 ? "s" : ""} connected
            </p>
          </div>
        )}

        <div className="status-info">
          <h2>Rate Limits</h2>
          <p>
            API endpoints are rate-limited to ensure fair access and system stability. The following
            limits apply:
          </p>
          <ul>
            <li>
              <strong>General API endpoints</strong>: 120 requests per minute per IP
            </li>
            <li>
              <strong>Stream endpoint</strong> (<code>/api/stream</code>): 20 connections per minute
              per IP
            </li>
            <li>
              <strong>Response headers</strong>: All API responses include <code>X-RateLimit-Limit</code>,{" "}
              <code>X-RateLimit-Remaining</code>, and <code>X-RateLimit-Reset</code> headers
            </li>
          </ul>
          <p>
            When rate limits are exceeded, the API returns HTTP 429 (Too Many Requests). The{" "}
            <code>Retry-After</code> header indicates when you can retry.
          </p>
          <p>
            For detailed API documentation, see the <a href="/api">API page</a>.
          </p>
        </div>

        <div className="status-footer">
          <p>
            Status data refreshes automatically every 30 seconds. For support inquiries, contact{" "}
            <a href="mailto:contact@foreign.rodeo">contact@foreign.rodeo</a>.
          </p>
        </div>
      </main>

      <footer className="public-footer">
        <div className="footer-wordmark">PRICEB.TC</div>
        <nav>
          <a href="/sponsors">Sponsor</a>
          <a href="/status">Status</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/studio">Studio</a>
        </nav>
        <p>Bitcoin price infrastructure. Honest data from Coinbase Exchange.</p>
      </footer>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
