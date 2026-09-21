import { SiteHeader } from "../components/site-header.js";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Bitcoin price data for everyone",
    features: [
      "120 requests/minute",
      "Live price API",
      "30+ currencies (incl. ARS/BRL/MXN)",
      "24h history",
      "Embeddable widgets",
      "Widgets with branding",
      "Community support"
    ],
    cta: "Keep using free",
    ctaHref: "/api",
    ctaStyle: "outline" as const
  },
  {
    name: "Pro",
    price: "$29",
    period: "per month",
    description: "For builders who ship",
    recommended: true,
    features: [
      "10,000 requests/minute",
      "Everything in Free",
      "Remove widget branding",
      "Priority support",
      "Commercial use",
      "SLA commitment"
    ],
    cta: "Start Pro",
    ctaHref: "#pro-checkout",
    ctaStyle: "solid" as const
  },
  {
    name: "Business",
    price: "$149",
    period: "per month",
    description: "For teams and platforms",
    features: [
      "100,000 requests/minute",
      "Everything in Pro",
      "Dedicated support",
      "Custom rate limits",
      "Invoice billing",
      "Priority feature requests"
    ],
    cta: "Talk to us",
    ctaHref: "mailto:contact@foreign.rodeo?subject=PRICEB.TC%20Business%20Plan",
    ctaStyle: "outline" as const
  }
];

export function PricingPage() {
  return (
    <div className="site-shell public-site">
      <SiteHeader />
      <main className="public-main pricing-main">
        <section className="pricing-hero">
          <p className="section-kicker">PRICING</p>
          <h1>Bitcoin price tools<br />that stay honest.</h1>
          <p className="pricing-subtitle">
            Free when you start. Pro when you scale. Powered by Coinbase Exchange.
          </p>
          
          <div className="pricing-toggle">
            <button className="is-active" aria-pressed="true">Monthly</button>
            <button aria-pressed="false">Yearly <span className="discount-badge">Save 20%</span></button>
          </div>
        </section>

        <section className="pricing-grid">
          {TIERS.map((tier) => (
            <article key={tier.name} className={`pricing-card${tier.recommended ? " pricing-card--recommended" : ""}`}>
              {tier.recommended && <span className="pricing-badge">Recommended</span>}
              <header className="pricing-card__header">
                <h2>{tier.name}</h2>
                <p className="pricing-card__description">{tier.description}</p>
                <div className="pricing-card__price">
                  <span className="price-amount">{tier.price}</span>
                  <span className="price-period">{tier.period}</span>
                </div>
              </header>
              
              <a 
                href={tier.ctaHref} 
                className={`pricing-cta pricing-cta--${tier.ctaStyle}`}
              >
                {tier.cta}
              </a>

              <ul className="pricing-features">
                {tier.features.map((feature) => (
                  <li key={feature}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="pricing-trust">
          <div className="trust-badge">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L12.5 7.5L18 8.5L14 12.5L15 18L10 15.5L5 18L6 12.5L2 8.5L7.5 7.5L10 2Z" fill="currentColor"/>
            </svg>
            <div>
              <strong>Honest data, honest pricing</strong>
              <p>Direct from Coinbase Exchange. No markup, no fake volume.</p>
            </div>
          </div>
        </section>

        <section className="pricing-included">
          <h2>What's included</h2>
          <div className="included-grid">
            <article>
              <h3>Live Bitcoin price</h3>
              <p>Real-time BTC/USD from Coinbase Exchange with WebSocket streaming. Sub-second updates when markets move.</p>
            </article>
            <article>
              <h3>30+ currencies</h3>
              <p>Convert to ARS, BRL, MXN, EUR, GBP and more. Daily FX rates with clear indicative labels.</p>
            </article>
            <article>
              <h3>Price history</h3>
              <p>Fetch 24h, 7d, 30d, 90d, or 1y historical data. Perfect for charts and trend analysis.</p>
            </article>
            <article>
              <h3>Embeddable widgets</h3>
              <p>Drop a price widget into any site or OBS overlay. Customizable themes, no tracking scripts.</p>
            </article>
          </div>
        </section>

        <section className="pricing-faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>How does Free tier rate limiting work?</summary>
            <p>Free tier allows 120 requests per minute per IP address. This is generous for personal projects, dashboards, and small apps. Pro removes this limit with per-key quotas.</p>
          </details>
          <details>
            <summary>Can I upgrade or downgrade anytime?</summary>
            <p>Yes. Changes take effect immediately. Pro-rated credits apply when upgrading mid-cycle.</p>
          </details>
          <details>
            <summary>What payment methods do you accept?</summary>
            <p>We accept all major credit cards via Stripe. Invoice billing is available for Business plans. Bitcoin payments coming soon.</p>
          </details>
          <details>
            <summary>Do you offer refunds?</summary>
            <p>Yes. If you're not satisfied within the first 14 days, we'll refund you in full. No questions asked.</p>
          </details>
          <details>
            <summary>Is my API key secure?</summary>
            <p>Keys are hashed with SHA-256. We never log or expose your full key after creation. Pro and Business keys can be rotated anytime from your dashboard.</p>
          </details>
          <details>
            <summary>What's your SLA?</summary>
            <p>Pro and Business plans include a 99.5% uptime SLA. We publish real-time status at <a href="/status">/status</a> and maintain detailed incident logs.</p>
          </details>
          <details>
            <summary>Need something custom?</summary>
            <p>Email us at <a href="mailto:contact@foreign.rodeo">contact@foreign.rodeo</a>. We're a small team building Bitcoin infrastructure for the long term.</p>
          </details>
        </section>
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
