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
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    priceId: { monthly: "", yearly: "" },
    description: "Get started with Bitcoin price data",
    features: [
      "120 requests per minute",
      "Current price & 24h data",
      "Historical price data",
      "Server-sent events stream",
      "No API key required",
    ],
    cta: "Start building",
    ctaLink: "/studio",
    outline: true,
  },
  {
    name: "Pro",
    price: { monthly: 29, yearly: 290 },
    priceId: { 
      monthly: "price_pro_monthly", 
      yearly: "price_pro_yearly" 
    },
    description: "For production applications",
    features: [
      "Everything in Free",
      "1,000 requests per minute",
      "Dedicated API keys",
      "Priority support",
      "99.9% uptime SLA",
    ],
    cta: "Start Pro trial",
    popular: true,
  },
  {
    name: "Business",
    price: { monthly: 149, yearly: 1490 },
    priceId: { 
      monthly: "price_business_monthly", 
      yearly: "price_business_yearly" 
    },
    description: "For high-volume integrations",
    features: [
      "Everything in Pro",
      "10,000 requests per minute",
      "Multiple API keys",
      "Custom data exports",
      "Dedicated account manager",
    ],
    cta: "Start Business trial",
  },
];

export function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const handleCheckout = async (tier: PricingTier) => {
    if (tier.ctaLink) {
      window.location.href = tier.ctaLink;
      return;
    }

    try {
      const priceId = tier.priceId[billingPeriod];
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, tier: tier.name.toLowerCase() }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Unable to start checkout. Please try again later.");
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
            <h1>Bitcoin price tools that scale with your business.</h1>
            <p className="pricing-hero__description">
              Start free. Upgrade when you need more.
            </p>
          </div>

          <div className="billing-toggle">
            <button
              type="button"
              className={billingPeriod === "monthly" ? "active" : ""}
              onClick={() => setBillingPeriod("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={billingPeriod === "yearly" ? "active" : ""}
              onClick={() => setBillingPeriod("yearly")}
            >
              Yearly
            </button>
          </div>

          <div className="pricing-grid">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`pricing-card${tier.popular ? " pricing-card--popular" : ""}`}
              >
                {tier.popular && (
                  <div className="pricing-card__badge">Most popular</div>
                )}
                <div className="pricing-card__header">
                  <h2 className="pricing-card__name">{tier.name}</h2>
                  <p className="pricing-card__description">{tier.description}</p>
                  <div className="pricing-card__price">
                    <span className="pricing-card__amount">
                      {formatPrice(tier.price[billingPeriod], billingPeriod)}
                    </span>
                    <span className="pricing-card__period">
                      {tier.price[billingPeriod] === 0
                        ? "forever"
                        : billingPeriod === "yearly"
                        ? "/mo, billed yearly"
                        : "/month"}
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
            <summary>Can I upgrade or downgrade at any time?</summary>
            <p>
              Yes. You can upgrade or downgrade your plan at any time through
              the customer portal. Changes take effect immediately, and we'll
              prorate the difference.
            </p>
          </details>
          <details>
            <summary>What payment methods do you accept?</summary>
            <p>
              We accept all major credit cards (Visa, Mastercard, American
              Express) and debit cards through Stripe.
            </p>
          </details>
          <details>
            <summary>Do you offer refunds?</summary>
            <p>
              We offer a 14-day money-back guarantee for new Pro and Business
              subscriptions. Contact us at{" "}
              <a href={`mailto:${siteContent.contactEmail}`}>
                {siteContent.contactEmail}
              </a>{" "}
              to request a refund.
            </p>
          </details>
          <details>
            <summary>What happens if I exceed my rate limit?</summary>
            <p>
              If you exceed your plan's rate limit, additional requests will
              receive a 429 status code. We recommend upgrading to a higher tier
              or implementing request queuing in your application.
            </p>
          </details>
          <details>
            <summary>Can I cancel my subscription?</summary>
            <p>
              Yes. You can cancel your subscription at any time through the
              customer portal. You'll retain access until the end of your
              current billing period.
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
