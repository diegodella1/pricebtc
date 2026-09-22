import { HomePage } from "./pages/home-page.js";
import { RendererPage } from "./pages/renderer-page.js";
import { PlaceholderPage } from "./pages/placeholder-page.js";
import { TermsPage } from "./pages/terms-page.js";
import { PrivacyPage } from "./pages/privacy-page.js";
import { StatusPage } from "./pages/status-page.js";

import { lazy, Suspense } from "react";
import { IS_STATIC_BUILD } from "./lib/api.js";
const StudioPage = lazy(() => import("./pages/studio-page.js").then(module => ({ default: module.StudioPage })));
const BidPage = lazy(() => import("./sats-bid/bid-page.js"));
const ArchivePage = lazy(() => import("./sats-bid/archive.js"));
const RulesPage = lazy(() => import("./sats-bid/rules.js"));
const AdminPage = lazy(() => import("./sats-bid/admin.js"));

export function App() {
  const path = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
  
  if (path === "/bid") {
    window.location.replace("/sponsors");
    return null;
  }
  
  if (["/sponsors", "/leaderboard", "/history", "/rules", "/admin"].includes(path) || /^\/day\/\d{4}-\d{2}-\d{2}$/.test(path)) {
    if (IS_STATIC_BUILD) return <main className="not-found"><span>SPONSORS</span><h1>LIVE SERVICE REQUIRED.</h1><p>This static edition provides Bitcoin price widgets. Paid sponsorship is unavailable here.</p><a className="button button--light" href="/">RETURN HOME →</a></main>;
    return <Suspense fallback={<main aria-busy="true">Loading Sponsors…</main>}>{path === "/sponsors" ? <BidPage /> : path === "/rules" ? <RulesPage /> : path === "/admin" ? <AdminPage /> : <ArchivePage />}</Suspense>;
  }
  if (path === "/") return <HomePage />;
  if (path === "/studio") return <Suspense fallback={<main aria-busy="true">Loading Widget Studio…</main>}><StudioPage /></Suspense>;
  if (path === "/embed") return <RendererPage mode="embed" />;
  if (path === "/overlay") return <RendererPage mode="overlay" />;
  if (path === "/pricing") return <PlaceholderPage title="Pricing" eyebrow="PRICING" description="Bitcoin price tools that scale with your business." />;
  if (path === "/status") return <StatusPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/privacy") return <PrivacyPage />;

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
