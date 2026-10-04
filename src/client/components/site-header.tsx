import { Brand } from "./brand.js";

export function SiteHeader() {
  return <header className="public-header site-header">
    <div>
      <Brand compact />
      <nav aria-label="Primary navigation">
        <a href="/#market">Price</a>
        <a href="/sponsors#claim">Sponsors</a>
        <a href="/api">API</a>
        <a className="header-nav-studio" href="/studio">Studio</a>
      </nav>
      <a className="header-quiet" href="/sponsors#claim">Claim</a>
    </div>
  </header>;
}
