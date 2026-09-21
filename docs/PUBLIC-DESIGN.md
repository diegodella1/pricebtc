# Public interface

The public site uses a charcoal background, Bitcoin orange for sponsorship and
primary actions, and green/red only for market direction. Space Grotesk, Geist
and JetBrains Mono are served locally. The existing exported widget fonts and
rendering remain isolated from the public interface tokens.

The homepage order is live price with sponsor space, price history, sponsor
inventory and daily leaderboard, working widget preview, then sources and FAQ.
On mobile, the sponsor follows the price and precedes history. Header links keep
the existing `#market`, `#formats`, `#sats-bid` and `#data` destinations.

There is one implemented paid position beside the price. OBS and website sponsor
placements are labeled future concepts, with generic example previews. Exported
widgets do not contain those examples. No audience estimates, fake partners,
latency promises, market data fixtures or payment simulations are published.

The coming-soon response continues to show an empty leaderboard and payment
notice. Failed sponsor requests show unavailability, not an empty confirmed
leaderboard. Payments and database configuration are not changed by the redesign.

The Studio and homepage share URL/iframe generation and clipboard behavior.
Exported URLs preserve version 1 parameters. Homepage preview and export use the
same layout, currency, history range and theme. Advanced Studio appearance
controls are initially collapsed; their values and independent mode drafts remain.

Verification covers sponsor placement geometry, future labels, no payment action,
clipboard failure, exported configuration, existing Studio controls, long prices,
external framing and transparent renderers. Use `CHROMIUM_LOW_MEMORY=true` for a
Chromium run with fewer renderer processes on the constrained local host; this is test-only.
Build into `.data/sats-preview`, never the active `dist` symlink.
