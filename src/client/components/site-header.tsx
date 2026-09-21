import { Brand } from "./brand.js";

export function SiteHeader() {
  return <header className="public-header site-header">
    <Brand compact />
    <nav aria-label="Primary navigation">
      <a href="/#market">Price</a><a href="/#formats">Widgets</a><a href="/#sats-bid">Sponsors</a>
    </nav>
    <a className="action-link" href="/studio">Create a widget <span aria-hidden="true">↗</span></a>
  </header>;
}
