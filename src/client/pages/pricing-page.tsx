import { useState } from "react";
import { SiteHeader } from "../components/site-header.js";
import siteContent from "../../shared/site-content.json";

type BillingPeriod = "monthly" | "yearly";

interface PricingTier {
  name: string;
  price: { monthly: number; yearly: number };
  priceId: { monthly: string; yearly: string };
  description: string;
  features: string[];
  cta: string;
  ctaLink?: string;
  popular?: boolean;
  outline?: boolean;
}

const PRICING_TIERS: PricingTier[] = [
  {
    name: "API Access",
    price: { monthly: 0, yearly: 0 },
    priceId: { monthly: "", yearly: "" },
    description: "Free Bitcoin price data for everyone",
    features: [
      "120 requests per minute",
      "Current price & 24h data",
      "Historical price data",
      "Server-sent events stream",
      "No API key required",
      "Free forever",
    ],
    cta: "Start building",
    ctaLink: "/studio",
    popular: true,
  },
  {
    name: "Support PRICEB.TC",
    price: { monthly: 0, yearly: 0 },
    priceId: { monthly: "", yearly: "" },
    description: "Become a Top 21 sponsor",
    features: [
      "Support the free API",
      "Your project showcased",
      "Top 21 leaderboard ranking",
      "Cumulative USD contributions",
      "Pay with crypto (USDT, USDC, BTC)",
      "Outbid anytime",
    ],
    cta: "Claim a sponsor spot",
    ctaLink: "/sponsors#claim",
    outline: true,
  },
];

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const handleCheckout = async (tier: PricingTier) => {
    if (tier.ctaLink) {
      window.location.href = tier.ctaLink;
      return;
    }
  };

  const formatPrice = (price: number, period: BillingPeriod) => {
    if (price === 0) return "$0";
    if (period === "yearly") {
      const monthlyEquivalent = Math.floor(price / 12);
      return `$${monthlyEquivalent}`;
    }
    return `$${price}`;
  };

  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="public-main pricing-page">
        <section className="pricing-hero">
          <div className="pricing-hero__intro">
            <p className="section-kicker">PRICING</p>
            <h1>Free API. Sponsor-supported.</h1>
            <p className="pricing-hero__description">
              Bitcoin price data is free for everyone. Support the project by becoming a Top 21 sponsor.
            </p>
          </div>

          <div className="pricing-grid">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`pricing-card${tier.popular ? " pricing-card--popular" : ""}`}
              >
                {tier.popular && (
                  <div className="pricing-card__badge">Always free</div>
                )}
                <div className="pricing-card__header">
                  <h2 className="pricing-card__name">{tier.name}</h2>
                  <p className="pricing-card__description">{tier.description}</p>
                  <div className="pricing-card__price">
                    <span className="pricing-card__amount">
                      {tier.name === "API Access" ? "Free" : "Crypto"}
                    </span>
                    <span className="pricing-card__period">
                      {tier.name === "API Access" ? "forever" : "payments"}
                    </span>
                  </div>
                </div>

                <ul className="pricing-card__features">
                  {tier.features.map((feature, index) => (
                    <li key={index}>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M13 4L6 11L3 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`pricing-card__cta${tier.outline ? " pricing-card__cta--outline" : ""}`}
                  onClick={() => handleCheckout(tier)}
                >
                  {tier.cta} →
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="public-section pricing-faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Is the API really free forever?</summary>
            <p>
              Yes. The Bitcoin price API is free with no plans for paid tiers. We're supported by sponsors who claim Top 21 spots with crypto contributions.
            </p>
          </details>
          <details>
            <summary>How do I become a sponsor?</summary>
            <p>
              Visit <a href="/sponsors#claim">/sponsors</a> and complete the claim flow. Choose your crypto asset (USDT, USDC, or BTC), send payment to the deposit address, and submit your transaction hash. You'll rank by cumulative USD contributions.
            </p>
          </details>
          <details>
            <summary>What payment methods do sponsors accept?</summary>
            <p>
              Sponsors pay with crypto: USDT on TRC20 (Tron), USDC on Solana, or BTC on-chain (Bitcoin mainnet). Payments are validated via public blockchain explorers.
            </p>
          </details>
          <details>
            <summary>What if I exceed the API rate limit?</summary>
            <p>
              The free tier provides 120 requests per minute. If you exceed this limit, additional requests will receive a 429 status code. Implement request queuing or caching in your application. Contact us at{" "}
              <a href={`mailto:${siteContent.contactEmail}`}>
                {siteContent.contactEmail}
              </a>{" "}
              if you need higher limits.
            </p>
          </details>
          <details>
            <summary>Can sponsors be outbid?</summary>
            <p>
              Yes. The Top 21 leaderboard ranks by cumulative USD contributions. Anyone can outbid you at any time by adding more crypto payments. Your total stays on record even if you drop out of Top 21.
            </p>
          </details>
        </section>
      </main>
      <footer className="public-footer">
        <div>
          <a href="/" className="footer-wordmark">
            PRICEB.TC
          </a>
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
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noreferrer"
          >
            ExchangeRate-API
          </a>
        </p>
      </footer>
    </div>
  );
}
