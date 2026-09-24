import { Brand } from "./brand.js";

export function SiteHeader() {
  return <header className="public-header site-header">
    <Brand compact />
    <nav aria-label="Primary navigation">
      <a href="/#market">Price</a>
      <a href="/#formats">Widgets</a>
      <a href="/api">API</a>
      <a href="/sponsors#claim">Sponsors</a>
      <a href="/pricing">Pricing</a>
    </nav>
    <a className="action-link" href="/studio">Create a widget.</a>
  </header>;
}
