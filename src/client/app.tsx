import { HomePage } from "./pages/home-page.js";
import { RendererPage } from "./pages/renderer-page.js";
import { StudioPage } from "./pages/studio-page.js";

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return <HomePage />;
  if (path === "/studio") return <StudioPage />;
  if (path === "/embed") return <RendererPage mode="embed" />;
  if (path === "/overlay") return <RendererPage mode="overlay" />;

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
