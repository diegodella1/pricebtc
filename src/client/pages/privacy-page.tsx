import { SiteHeader } from "../components/site-header.js";
import siteContent from "../../shared/site-content.json";

export function PrivacyPage() {
  return (
    <div className="site-shell public-site">
      <SiteHeader />
      <main className="public-main legal-document">
        <p className="section-kicker">LEGAL</p>
        <h1>Privacy Policy</h1>
        <p className="effective-date">Effective: September 21, 2026</p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            PRICEB.TC ("we," "us," or "the Service") respects your privacy. This Privacy Policy 
            explains how we collect, use, and protect information when you use the Service.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          
          <h3>2.1 Automatically Collected Information</h3>
          <p>When you access the Service, we automatically collect:</p>
          <ul>
            <li><strong>Server Logs:</strong> IP addresses, request timestamps, HTTP methods, URLs, user agents, and response codes</li>
            <li><strong>API Usage:</strong> Requested currencies, history ranges, and response times for rate limiting and performance monitoring</li>
            <li><strong>Widget Analytics:</strong> Embedded widget configurations (layout, currency, colors) for usage statistics</li>
          </ul>

          <h3>2.2 Optional Information</h3>
          <p>If you participate in paid features (e.g., sponsorship), we may collect:</p>
          <ul>
            <li>Email addresses or contact information provided during registration</li>
            <li>Payment transaction identifiers (we do not store credit card numbers or crypto wallet private keys)</li>
            <li>Sponsorship preferences and advertising content you submit</li>
          </ul>

          <h3>2.3 Cookies and Local Storage</h3>
          <p>
            The Service uses minimal cookies and browser local storage to remember your currency 
            preference and widget configurations. These are functional cookies required for the 
            Service to work properly. We do not use third-party tracking cookies or advertising networks.
          </p>
        </section>

        <section>
          <h2>3. How We Use Information</h2>
          <p>We use collected information to:</p>
          <ul>
            <li>Provide and maintain the Service</li>
            <li>Enforce rate limits and prevent abuse</li>
            <li>Monitor system health and performance</li>
            <li>Process sponsorship payments and display sponsor content</li>
            <li>Respond to support inquiries</li>
            <li>Improve the Service based on usage patterns</li>
          </ul>
          <p>
            <strong>We do not sell your personal information.</strong> We do not share your data 
            with advertisers, data brokers, or third-party marketers.
          </p>
        </section>

        <section>
          <h2>4. Data Retention</h2>
          <p>
            Server logs are retained for up to 90 days for operational purposes. Sponsorship records 
            are kept for accounting and compliance requirements. You may request deletion of your 
            personal information by contacting us.
          </p>
        </section>

        <section>
          <h2>5. Third-Party Services</h2>
          <p>The Service integrates with third-party providers:</p>
          <ul>
            <li><strong>Coinbase Exchange:</strong> Public WebSocket feed for Bitcoin price data (no personal data shared)</li>
            <li><strong>ExchangeRate-API:</strong> Daily foreign exchange rates (no user data transmitted)</li>
            <li><strong>Payment Processors:</strong> If you make payments, transaction data is handled by third-party processors subject to their privacy policies</li>
          </ul>
          <p>
            We do not control third-party services and are not responsible for their privacy practices.
          </p>
        </section>

        <section>
          <h2>6. Data Security</h2>
          <p>
            We implement industry-standard security measures including HTTPS encryption, secure headers, 
            rate limiting, and access controls. However, no system is completely secure. Use the Service 
            at your own risk.
          </p>
        </section>

        <section>
          <h2>7. International Users</h2>
          <p>
            The Service is hosted on global infrastructure. By using PRICEB.TC, you consent to the 
            transfer and processing of your information in countries where we operate, which may have 
            different data protection laws than your jurisdiction.
          </p>
        </section>

        <section>
          <h2>8. Children's Privacy</h2>
          <p>
            The Service is not directed to individuals under 18 years of age. We do not knowingly 
            collect personal information from children. If you believe a child has provided us with 
            personal information, contact us to request deletion.
          </p>
        </section>

        <section>
          <h2>9. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your personal information</li>
            <li>Object to or restrict certain processing activities</li>
            <li>Withdraw consent where processing is based on consent</li>
          </ul>
          <p>
            To exercise these rights, contact us at{" "}
            <a href={`mailto:${siteContent.contactEmail}`}>{siteContent.contactEmail}</a>.
          </p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be reflected in the 
            "Effective" date above. Continued use of the Service after changes constitutes acceptance 
            of the updated Policy.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            For privacy questions or to exercise your rights, contact us at{" "}
            <a href={`mailto:${siteContent.contactEmail}`}>{siteContent.contactEmail}</a>.
          </p>
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
