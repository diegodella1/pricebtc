# Public interface design system

## Design tokens

The public site uses a unified design system across all pages:

- **Background**: `#0d1012` (charcoal base)
- **Surface**: `#14181c` (one step lighter)
- **Text**: `#fdf6e3` (cream)
- **Muted text**: `#93a1a1` (muted gray)
- **Accent**: `#cb4b16` (Bitcoin orange) — THE ONE primary CTA color
- **Link/API**: `#2aa198` (cyan) — links and API references
- **Positive/Negative**: green/red ONLY for market deltas

## Typography

- **Bricolage Grotesque**: Price displays and hero numbers
- **IBM Plex Sans**: Body copy
- **IBM Plex Mono**: Labels, technical data, metadata

Exported widget fonts remain isolated from public interface tokens.

## Navigation

**Primary nav** (header pill): Price · Widgets · API · Pricing

**Header CTA** (single solid button): "Create a widget."

**Footer links**: Sponsor · Status · Terms · Privacy · Studio

Sponsors are not in primary nav until payments are live.

## Visual rules

- **1 solid CTA per view** — additional sponsor CTAs use outline style
- **₿ in brand mark** — centered in the circle
- **Surface + 1px border** for cards and panels
- **No heavy glass effects** — minimal backdrop blur on sticky header only

## Homepage structure

Live price with sponsor space, price history, sponsor inventory and daily 
leaderboard, working widget preview, then sources and FAQ. On mobile, the 
sponsor follows the price and precedes history.

## Sponsor implementation

There is one implemented paid position beside the price. Sponsors are ranked by
cumulative sats bid (pay-to-rank model), not fixed USD packages. OBS and website
placements remain labeled future concepts with generic example previews. Exported
widgets do not contain sponsor examples. No audience estimates, fake partners,
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
