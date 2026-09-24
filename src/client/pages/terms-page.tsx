import { SiteHeader } from "../components/site-header.js";
import siteContent from "../../shared/site-content.json";

export function TermsPage() {
  return (
    <div className="site-shell public-site">
      <SiteHeader />
      <main className="public-main legal-document">
        <p className="section-kicker">LEGAL</p>
        <h1>Terms of Service</h1>
        <p className="effective-date">Effective: September 21, 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using PRICEB.TC (the "Service"), you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Service Description</h2>
          <p>
            PRICEB.TC provides timestamped Bitcoin price observations sourced from Coinbase Exchange. 
            The Service includes a public JSON API, embeddable widgets, and transparent overlay URLs 
            for use in websites, applications, and broadcast software.
          </p>
          <p>
            <strong>Not Financial Advice:</strong> All price data is provided for informational purposes only. 
            PRICEB.TC does not provide financial, investment, tax, or legal advice. The Bitcoin price observations 
            reflect a single exchange source and are not a global index. Do not rely on this data for trading, 
            investment decisions, or financial planning.
          </p>
        </section>

        <section>
          <h2>3. Data Source and Accuracy</h2>
          <p>
            BTC/USD prices are sourced from Coinbase Exchange public trade data. Other currency prices 
            are <strong>indicative conversions</strong> using daily foreign exchange rates, not real-time 
            cryptocurrency market prices in those currencies.
          </p>
          <p>
            While we strive for accuracy, PRICEB.TC makes no warranties regarding the completeness, 
            reliability, or timeliness of price data. Network delays, exchange outages, or service 
            interruptions may cause stale or unavailable data.
          </p>
        </section>

        <section>
          <h2>4. Permitted Use</h2>
          <p>You may use the Service for:</p>
          <ul>
            <li>Personal information and monitoring</li>
            <li>Embedding widgets on websites and applications</li>
            <li>Displaying overlays in live streams or broadcasts</li>
            <li>Programmatic access via the public API within rate limits</li>
          </ul>
        </section>

        <section>
          <h2>5. Prohibited Use</h2>
          <p>You may not:</p>
          <ul>
            <li>Use the Service for automated trading, financial derivatives, or investment products</li>
            <li>Circumvent rate limits or abuse API endpoints</li>
            <li>Scrape, mirror, or republish the Service without authorization</li>
            <li>Misrepresent the data source or remove attribution</li>
            <li>Use the Service to violate any law or regulation</li>
          </ul>
        </section>

        <section>
          <h2>6. Sponsorship and Paid Features</h2>
          <p>
            The Service may offer optional paid sponsorship or promotional features. Participation 
            is governed by separate rules and payment terms disclosed at the time of purchase. 
            Sponsorship does not grant priority access to price data or preferential API treatment.
          </p>
        </section>

        <section>
          <h2>7. Service Availability</h2>
          <p>
            PRICEB.TC is provided "as is" without guarantees of uptime or availability. We reserve 
            the right to modify, suspend, or discontinue the Service at any time without notice. 
            Check the <a href="/status">Status</a> page for current operational information.
          </p>
        </section>

        <section>
          <h2>8. Intellectual Property</h2>
          <p>
            The Service design, code, and branding are protected by copyright and other intellectual 
            property laws. You may not copy, modify, or distribute the Service's code or interface 
            without permission.
          </p>
        </section>

        <section>
          <h2>9. Limitation of Liability</h2>
          <p>
            PRICEB.TC and its operators are not liable for any direct, indirect, incidental, or 
            consequential damages arising from your use of the Service, including but not limited 
            to financial losses, data loss, or service interruptions.
          </p>
        </section>

        <section>
          <h2>10. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless PRICEB.TC and its operators from any claims, 
            damages, or expenses arising from your use of the Service or violation of these Terms.
          </p>
        </section>

        <section>
          <h2>11. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the Service after changes 
            constitutes acceptance of the revised Terms. Material changes will be reflected in 
            the "Effective" date above.
          </p>
        </section>

        <section>
          <h2>12. Governing Law</h2>
          <p>
            These Terms are governed by applicable international and local laws. Disputes will be 
            resolved through good-faith negotiation.
          </p>
        </section>

        <section>
          <h2>13. Contact</h2>
          <p>
            For questions about these Terms, contact us at{" "}
            <a href={`mailto:${siteContent.contactEmail}`}>{siteContent.contactEmail}</a>.
          </p>
        </section>
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
