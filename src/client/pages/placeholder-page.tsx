import { SiteHeader } from "../components/site-header.js";

interface PlaceholderPageProps {
  title: string;
  eyebrow?: string;
  description?: string;
}

export function PlaceholderPage({ title, eyebrow, description }: PlaceholderPageProps) {
  return (
    <div className="site-shell public-site">
      <SiteHeader />
      <main className="public-main" style={{ padding: "80px 32px", minHeight: "60vh" }}>
        {eyebrow && <p className="section-kicker">{eyebrow}</p>}
        <h1 style={{ fontSize: "clamp(32px, 5vw, 60px)", marginTop: "16px", marginBottom: "24px" }}>
          {title}
        </h1>
        {description && (
          <p style={{ color: "var(--text-muted)", maxWidth: "600px", fontSize: "18px", lineHeight: "1.6" }}>
            {description}
          </p>
        )}
      </main>
      <footer className="public-footer">
        <div className="footer-wordmark">PRICEB.TC</div>
        <nav>
          <a href="/sponsors#claim">Sponsor</a>
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
