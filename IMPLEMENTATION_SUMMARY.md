# Complete CRO Stack Implementation Summary

**PR:** [#36](https://github.com/diegodella1/pricebtc/pull/36)  
**Branch:** `cursor/fix-sponsors-copy-p0-aab5`  
**Status:** ✅ Ready for deployment & smoke testing  

---

## Overview

Complete conversion optimization stack bundled per businessBot sequence:
1. **P0 Copy Fixes** - Lightning/waitlist → crypto/claim language
2. **EXP-01** - Direct claim entry paths + CTA optimization
3. **EXP-02** - UX wire exact implementation: claim-first routing + canonical `#board`
4. **SEO P0** - Indexable + sitemap + strong SSR + JSON-LD
5. **GA4** - Real conversion funnel events (`G-T9E3ZF3J0T`)

**EXP-03 Out of Scope:** Next PR after EXP-01+02+SEO live & validated (Asset→Pay→Watching flow, identity soft-gate after payment).

---

## EXP-02 UX Wire Implementation (Exact)

**Source:** `UX-P0-exp02-exp03-claim-funnel.md` (UX UI bot)

### Routing When cryptoEnabled = true

| URL Pattern | View | Behavior |
|-------------|------|----------|
| `/sponsors` (no hash) | **Claim** | Set `#claim` on first paint (default landing) |
| `/sponsors#claim` | Claim | Canonical claim hash |
| `/sponsors#board` | Top 21 | **Canonical board hash** (NOT empty hash) |
| `/sponsors#waitlist` | **Redirect → `#claim`** | Blocked when crypto ON |
| Empty hash `""` | **Claim** | When crypto ON (not board) |

**Critical Change:** Empty hash means claim (not board) when crypto enabled. Board requires explicit `#board`.

### Navigation & Affordances

**"← Top 21 leaderboard" Link**
- **Location:** Claim header (always visible when `view === "claim"`)
- **Style:** Text link (`.bid-back-link`, not primary filled CTA)
- **Action:** `href="#board"`
- **Purpose:** Keep leaderboard one intentional click away (never "lost")

**Board Primary CTA:** "Claim a spot →" / `#claim` (unchanged)

### Completion Behavior
- After payment confirmed: redirect to `#board` (not empty hash)
- User stays in claim flow until they choose to leave

### Waitlist Removal (crypto ON)
- Hide ALL `#waitlist` / "Join waitlist" CTAs
- Waitlist view only renders when `!hasCryptoAddresses` (failsafe)
- No "waitlist" word in copy when crypto enabled
- Zero entry points when crypto ON

### Home Empty State Links
**All empties → `/sponsors#claim`:**
- `EmptySponsorCTA` (hero CTA when no top sponsor)
- `SponsorStrip` empty (#02 stripe)
- `LogoRail` empty cells (positions 3-7)
- Ranking empty slots

**Never point to waitlist when any route available**

### Implementation Details
- Uses `window.location.replace` for hash redirects (no history spam)
- Default view state changed to `"claim"` (was `"board"`)
- Explicit hash routing: `#claim` / `#board` / `#waitlist` (no implicit behaviors)
- GA4 `sponsors_view` fires on board load

---

## File Changes by Feature

### P0 Copy (4 files)
- `scripts/prepare-static.mjs` - Meta description
- `src/client/sats-bid/coming-soon.tsx` - "Crypto contributions"
- `src/client/sats-bid/bid-page.tsx` - "Pay crypto"
- `src/client/sats-bid/waitlist-form.tsx` - "Expands" not "launches"

### EXP-01 Conversion (3 files)
- `src/client/components/site-header.tsx` - Nav → `/sponsors#claim`
- `src/client/pages/home-page.tsx` - 3rd CTA when crypto ON
- `src/client/sats-bid/sponsors-page.tsx` - Removed competing waitlist CTA

### EXP-02 UX Wire (3 files)
- `src/client/sats-bid/sponsors-page.tsx`
  - Default view: `"claim"` (not `"board"`)
  - Routing logic: no hash → `#claim`, `#waitlist` → `#claim`
  - Empty hash → claim view when crypto ON
  - Hash change handler: explicit `#board` / `#claim` routing
  - Completion redirect: `#board` (not empty hash)
  - Added "← Top 21 leaderboard" link in claim header
  - Waitlist view conditional: only when `!hasCryptoAddresses`
- `src/client/sats-bid/components.tsx`
  - `EmptySponsorCTA`: → `/sponsors#claim` (was conditional waitlist)
  - `SponsorStrip` empty: → `/sponsors#claim`
  - `LogoRailCell` empty: → `/sponsors#claim`
  - Removed unused `cryptoEnabled` prop from `LogoRail`
- `src/client/sats-bid/sats-bid.css`
  - Added `.bid-back-link` style (text link, not primary CTA)

### GA4 Events (3 files)
- `src/client/lib/ga4.ts` (NEW)
  - `trackEvent()` helper
  - `GA4Events` object with 4 methods
- `src/client/sats-bid/sponsors-page.tsx`
  - `sponsors_view` on board load
- `src/client/sats-bid/crypto-claim.tsx`
  - `claim_start` on identity step (once per session)
  - `watching_intent` on "I've sent payment"
  - `deposit_confirmed` on validation confirmed

### SEO P0 (12 files)
- `src/server/app.ts` - Removed noindex header
- `scripts/prepare-static.mjs` - SSR H1, JSON-LD, robots meta
- `src/shared/seo-pages.json` - Added `/sponsors`
- `public/llms.txt` - Sponsorship link
- 7 page footers (`*-page.tsx`) - `/sponsors` → `/sponsors#claim`
- `tests/seo-documents.test.ts` - Allow `logo` + `sameAs`

---

## EXP-02 Routing State Machine

```
cryptoEnabled = true:

        /sponsors (no hash)
               ↓
        Set #claim on first paint
               ↓
        [CLAIM VIEW] ←──────────────────┐
          ↓                              │
    "← Top 21 leaderboard" link         │
          ↓                              │
        [BOARD VIEW]                     │
          ↓                              │
    "Claim a spot →"                     │
          ↓                              │
        #claim ─────────────────────────┘

    #waitlist → redirect to #claim
    empty hash → claim view (not board)
    #board → board view (explicit)
```

---

## Testing Checklist

### EXP-02 Routing (cryptoEnabled)

**1. Default Landing**
```bash
# Visit: https://priceb.tc/sponsors (no hash)
# ✓ Should land on #claim view
# ✓ URL should show #claim in address bar
# ✓ "← Top 21 leaderboard" link visible
```

**2. Waitlist Redirect**
```bash
# Visit: https://priceb.tc/sponsors#waitlist
# ✓ Should redirect to #claim
# ✓ No "Join waitlist" CTAs visible
```

**3. Explicit Board Hash**
```bash
# Visit: https://priceb.tc/sponsors#board
# ✓ Should show Top 21 leaderboard
# ✓ "Claim a spot →" CTA visible
# ✓ GA4 sponsors_view event fires
```

**4. Back Navigation**
```bash
# From #claim view:
# Click "← Top 21 leaderboard"
# ✓ Navigate to #board (not empty hash)
# ✓ Leaderboard visible
```

**5. Empty Hash = Claim**
```bash
# Manually clear hash or set to empty: /sponsors#
# ✓ Should show claim view (not board)
# ✓ When crypto ON
```

**6. Completion Redirect**
```bash
# Complete a payment flow
# ✓ Should redirect to #board (not empty hash)
# ✓ User lands on leaderboard
```

### Home Empty State

**7. Empty Slots Link to #claim**
```bash
# When sponsor slots empty:
# ✓ Hero empty CTA → /sponsors#claim
# ✓ Strip #02 empty → /sponsors#claim
# ✓ Rail positions 3-7 empty → /sponsors#claim
```

### GA4 Events (Chrome DevTools Console)

**8. Board View**
```bash
# Navigate to #board
# ✓ sponsors_view event
```

**9. Claim Start**
```bash
# Navigate to #claim
# ✓ claim_start event (once)
```

**10. Watching Intent**
```bash
# Enter payment info, click "I've sent the payment"
# ✓ watching_intent event
# ✓ asset_type param present
```

**11. Deposit Confirmed**
```bash
# Wait for payment confirmation
# ✓ deposit_confirmed event
# ✓ asset_type + amount_usd params
```

### SEO

**12. Indexability**
```bash
curl -I https://priceb.tc/sponsors | grep -i robots
# ✓ No X-Robots-Tag: noindex
# ✓ Or robots: index,follow
```

**13. Sitemap**
```bash
curl -s https://priceb.tc/sitemap.xml | grep sponsors
# ✓ <loc>https://priceb.tc/sponsors</loc>
```

**14. SSR Content**
```bash
curl -s https://priceb.tc/sponsors | grep 'Claim a Top 21'
# ✓ H1 present: "Claim a Top 21 sponsor slot..."
```

**15. JSON-LD**
```bash
curl -s https://priceb.tc/sponsors | grep -A 20 'structured-data'
# ✓ WebPage + Offer + Organization schemas
```

---

## Build & Test Results

```bash
✅ npm run typecheck    # No errors
✅ npm run lint         # Passed
✅ npm test             # 107 passed | 29 skipped
✅ npm run build        # SUCCESS
```

---

## EXP-03 Notes (Next PR)

**NOT Implemented in This PR** per businessBot sequence:

### What EXP-03 Would Add:
1. **Step Reorder:** Asset → Pay → Watching → Profile (identity after payment)
2. **Remove Identity Gate:** No name/logo before "I've sent the payment"
3. **Deferred Profile:** Collect after watching starts
4. **Persistent Status:** Payment status chrome visible during profile step
5. **Gated Listing:** Public board only after profile saved + confirmed

### Why Deferred:
- Must validate EXP-01+02 conversion lift first
- Smoke test new routing before identity flow redesign
- UX re-review required (PASS/FAIL criteria in wire)
- More invasive than routing/copy changes

### Current Flow Preserved:
- Identity → Asset → Payment → Watching (PR #35 baseline)
- This PR only changes landing/routing, not step order

---

## Deployment Notes

**Ship Order:** (per businessBot)
1. ✅ **This PR (#36):** P0 Copy + EXP-01 + EXP-02 + SEO + GA4
2. ⏸️ **Smoke Testing:** Validate conversion lift, no regressions
3. ⏳ **Next PR:** EXP-03 (identity after payment, if validated)

**Rollback Plan:**
- Routing is client-side hash-based (instant revert)
- No DB schema changes
- SEO changes are additive (removing noindex is safe to revert)
- GA4 events are fire-and-forget (no breakage if disabled)

**Monitoring:**
- GA4: `sponsors_view`, `claim_start`, `watching_intent`, `deposit_confirmed`
- Funnel: `/sponsors` → claim landing rate → payment starts → confirmations
- SEO: Google Search Console impressions on `/sponsors`

---

## Summary Table

| Element | Before | After | Feature |
|---------|--------|-------|---------|
| **Default landing** | Board view | #claim | EXP-02 |
| **Canonical board** | Empty hash | #board | EXP-02 |
| **Empty hash means** | Board | Claim (when crypto ON) | EXP-02 |
| **#waitlist access** | Always | Redirect → #claim (when ON) | EXP-02 |
| **Claim nav back** | None | "← Top 21 leaderboard" | EXP-02 |
| **Completion redirect** | Empty hash | #board | EXP-02 |
| **Home empties →** | `/sponsors` or waitlist | `/sponsors#claim` | EXP-02 |
| **Waitlist render** | Always | Only when !crypto | EXP-02 |
| **Primary nav** | `/sponsors` | `/sponsors#claim` | EXP-01 |
| **Home CTAs** | 2 CTAs | 3 when crypto ON | EXP-01 |
| **Sponsors CTAs** | Claim + Waitlist | Claim only (when ON) | EXP-01 |
| **Meta description** | "Lightning...waitlist" | "crypto...BTC, USDT, USDC" | P0 Copy |
| **Indexing** | noindex,nofollow | index,follow | SEO P0 |
| **Sitemap** | Missing | Included | SEO P0 |
| **SSR H1** | Generic | "Claim a Top 21..." | SEO P0 |
| **JSON-LD** | None | WebPage + Offer + Org | SEO P0 |
| **GA4 tracking** | None | 4 conversion events | GA4 |

---

**Status:** ✅ Complete, ready for deployment & validation before EXP-03

**Next:** Smoke test → validate conversion lift → EXP-03 PR (identity after payment)
