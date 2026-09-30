import { Brand } from "./brand.js";

export function SiteHeader() {
  return <header className="public-header site-header">
    <div>
      <Brand compact />
      <nav aria-label="Primary navigation">
        <a href="/#market">Price</a>
        <a href="/sponsors#claim">Sponsors</a>
        <a href="/api">API</a>
      </nav>
      <a className="action-link" href="/sponsors#claim">Claim a spot →</a>
    </div>
  </header>;
}
