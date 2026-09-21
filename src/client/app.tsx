import { HomePage } from "./pages/home-page.js";
import { RendererPage } from "./pages/renderer-page.js";
import { PlaceholderPage } from "./pages/placeholder-page.js";

import { lazy, Suspense } from "react";
import { IS_STATIC_BUILD } from "./lib/api.js";
const StudioPage = lazy(() => import("./pages/studio-page.js").then(module => ({ default: module.StudioPage })));
const BidPage = lazy(() => import("./sats-bid/bid-page.js"));
const ArchivePage = lazy(() => import("./sats-bid/archive.js"));
const RulesPage = lazy(() => import("./sats-bid/rules.js"));
const AdminPage = lazy(() => import("./sats-bid/admin.js"));

export function App() {
  const path = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
  if (["/bid", "/leaderboard", "/history", "/rules", "/admin"].includes(path) || /^\/day\/\d{4}-\d{2}-\d{2}$/.test(path)) {
    if (IS_STATIC_BUILD) return <main className="not-found"><span>SATS BID</span><h1>LIVE SERVICE REQUIRED.</h1><p>This static edition provides Bitcoin price widgets. Paid participation is unavailable here.</p><a className="button button--light" href="/">RETURN HOME →</a></main>;
    return <Suspense fallback={<main aria-busy="true">Loading Sats Bid…</main>}>{path === "/bid" ? <BidPage /> : path === "/rules" ? <RulesPage /> : path === "/admin" ? <AdminPage /> : <ArchivePage />}</Suspense>;
  }
  if (path === "/") return <HomePage />;
  if (path === "/studio") return <Suspense fallback={<main aria-busy="true">Loading Widget Studio…</main>}><StudioPage /></Suspense>;
  if (path === "/embed") return <RendererPage mode="embed" />;
  if (path === "/overlay") return <RendererPage mode="overlay" />;
  if (path === "/pricing") return <PlaceholderPage title="Pricing" eyebrow="PRICING" description="Bitcoin price tools that scale with your business." />;
  if (path === "/sponsors") return <PlaceholderPage title="Sponsor" eyebrow="SPONSOR" description="Support honest Bitcoin price infrastructure." />;
  if (path === "/status") return <PlaceholderPage title="Status" eyebrow="STATUS" description="System health and uptime monitoring." />;
  if (path === "/terms") return <PlaceholderPage title="Terms of Service" eyebrow="LEGAL" />;
  if (path === "/privacy") return <PlaceholderPage title="Privacy Policy" eyebrow="LEGAL" />;

  return (
    <main className="not-found">
      <span>404 / SIGNAL LOST</span>
      <h1>
        NOTHING
        <br />
        ON THIS FREQUENCY.
      </h1>
      <a className="button button--light" href="/">
        RETURN HOME →
      </a>
    </main>
  );
}
