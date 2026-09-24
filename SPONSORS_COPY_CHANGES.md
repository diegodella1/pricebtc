# Sponsors P0 Copy Fix + EXP-01 Conversion Optimization

## Problem Statement

**P0 - Copy Bug:** The live `/sponsors` page at https://priceb.tc/sponsors displayed outdated copy referencing Lightning invoices and waitlist-primary flow, when the actual product is crypto claim (BTC/USDT/USDC) with Phase 2 auto-watch.

**EXP-01 - Conversion:** Low claim conversion due to indirect entry paths and competing CTAs.

## Changes Summary

### Part 1: P0 Copy Fixes (Lightning/Waitlist → Crypto/Claim)

### 1. Meta Description (scripts/prepare-static.mjs:240)

**BEFORE:**
```
Join the waitlist for PRICEB.TC sponsorship. Pay Lightning sats, rank in the Top 21, and display your project beside the Bitcoin price.
```

**AFTER:**
```
Support PRICEB.TC and rank in the Top 21 by cumulative crypto contributions. Pay with BTC, USDT, or USDC. Anyone can outbid you anytime.
```

**Impact:** Updates `<meta name="description">`, `<meta property="og:description">`, and `<meta name="twitter:description">` tags on the `/sponsors` page.

---

### 2. Bid Page Intro (src/client/sats-bid/bid-page.tsx:138)

**BEFORE:**
```tsx
Pay Lightning sats. Rank in the Top 21. Anyone can outbid you anytime.
```

**AFTER:**
```tsx
Pay crypto. Rank in the Top 21. Anyone can outbid you anytime.
```

**Context:** Intro text on the legacy bid page (when accessed via old routes).

---

### 3. Waitlist Form Heading (src/client/sats-bid/waitlist-form.tsx:47)

**BEFORE:**
```tsx
Get notified when sponsorship launches
```

**AFTER:**
```tsx
Get notified when sponsorship expands
```

**Context:** Heading for the waitlist section. Changed from "launches" to "expands" because crypto payments are already live.

---

### 4. Waitlist Form Intro (src/client/sats-bid/waitlist-form.tsx:48-49)

**BEFORE:**
```tsx
Be among the first to claim a Top 21 spot. Crypto payments opening soon.
```

**AFTER:**
```tsx
Be among the first to know about new payment options and sponsorship opportunities.
```

**Context:** Intro text for waitlist form. Removed "opening soon" since crypto is live.

---

### 5. Coming Soon Subtitle (src/client/sats-bid/coming-soon.tsx:90)

**BEFORE:**
```tsx
Crypto payments launching soon. Join the waitlist to claim a Top 21 spot.
```

**AFTER:**
```tsx
Support PRICEB.TC with crypto contributions and rank in the Top 21.
```

**Context:** Subtitle on the coming-soon view (shown when a round has the `coming_soon` flag).

---

### Part 2: EXP-01 Conversion Optimization (Direct Claim Entry)

#### 6. Primary Nav "Sponsors" Link (src/client/components/site-header.tsx:10)

**BEFORE:**
```tsx
<a href="/sponsors">Sponsors</a>
```

**AFTER:**
```tsx
<a href="/sponsors#claim">Sponsors</a>
```

**Impact:** Direct navigation to claim flow. Reduces one click/scroll to conversion.

---

#### 7. Home Page Market CTAs (src/client/pages/home-page.tsx:127-165)

**BEFORE:**
- 2 CTAs: "Get price as JSON" + "Create a widget"

**AFTER:**
- 3 CTAs when crypto enabled: "Get price as JSON" + "Create a widget" + **"Claim a sponsor spot"**
- New CTA fetches crypto config on mount
- Links to `/sponsors#claim`
- Does NOT demote existing widget CTAs

**Implementation:**
```tsx
useEffect(() => {
  if (IS_STATIC_BUILD) return;
  async function checkCryptoConfig() {
    try {
      const response = await fetch("/api/crypto-sponsors/config");
      if (response.ok) {
        const config = await response.json() as { enabled: boolean; assets: { type: string }[] };
        setCryptoEnabled(config.enabled && config.assets.length > 0);
      }
    } catch {
      setCryptoEnabled(false);
    }
  }
  void checkCryptoConfig();
}, []);
```

---

#### 8. Sponsors Page CTAs (src/client/sats-bid/sponsors-page.tsx:101-106)

**BEFORE (when crypto enabled):**
```tsx
<div className="bid-cta-section">
  <a href="#claim" className="bid-cta-primary">
    Claim a spot →
  </a>
  <a href="#waitlist" className="bid-cta-secondary">
    Join waitlist
  </a>
</div>
```

**AFTER (when crypto enabled):**
```tsx
<div className="bid-cta-section">
  <a href="#claim" className="bid-cta-primary">
    Claim a spot →
  </a>
</div>
```

**Impact:** Removed competing "Join waitlist" secondary CTA when crypto enabled. Waitlist CTA only shows when payments disabled (failsafe).

---

## Verification

### Build Output
```bash
$ npm run build
✓ built in 1.15s
Prepared route-specific HTML in /workspace/dist/client
```

### Meta Tag Verification
```bash
$ grep 'meta name="description"' dist/client/sponsors/index.html
<meta name="description" content="Support PRICEB.TC and rank in the Top 21 by cumulative crypto contributions. Pay with BTC, USDT, or USDC. Anyone can outbid you anytime." />
```

### No Outdated Copy Found
```bash
$ grep -E '(Lightning|waitlist.*for.*sponsorship|Pay Lightning)' dist/client/sponsors/index.html
# No matches found ✓
```

## CI Status

✅ TypeScript: Passed  
✅ ESLint: Passed  
✅ Tests: 107 passed, 29 skipped  
✅ Build: Success  
✅ CI/Validate: SUCCESS  

## Summary Table

| Element | Before | After |
|---------|--------|-------|
| /sponsors meta description | "Lightning sats...waitlist" | "crypto contributions...BTC, USDT, or USDC" |
| Primary nav "Sponsors" link | `/sponsors` | `/sponsors#claim` |
| Home market CTAs | 2 CTAs (JSON, Widget) | 3 CTAs when crypto enabled (+ Claim spot) |
| /sponsors board CTAs (crypto ON) | Claim + Waitlist (competing) | Claim only |
| Waitlist heading | "when sponsorship launches" | "when sponsorship expands" |
| Waitlist intro | "Crypto payments opening soon" | "new payment options and opportunities" |
| Bid page intro | "Pay Lightning sats" | "Pay crypto" |
| Coming soon subtitle | "launching soon...waitlist" | "crypto contributions...Top 21" |

## Affected Files

### P0 Copy Fixes
- `scripts/prepare-static.mjs` - Meta description
- `src/client/sats-bid/bid-page.tsx` - Intro text
- `src/client/sats-bid/waitlist-form.tsx` - Heading and intro
- `src/client/sats-bid/coming-soon.tsx` - Subtitle

### EXP-01 Conversion
- `src/client/components/site-header.tsx` - Nav link
- `src/client/pages/home-page.tsx` - Added conditional CTA
- `src/client/sats-bid/sponsors-page.tsx` - Removed competing waitlist CTA

## Notes

- **English-only:** No Spanish in production strings ✓
- **P0 copy-only:** No payment logic, watcher code, or business model modifications ✓
- **EXP-01 authorized ship:** Raises claim starts; no economics debate required ✓
- **Failsafes preserved:** Waitlist remains available when crypto disabled ✓
- **No widget demotion:** Existing CTAs intact ✓

## PR

**URL:** https://github.com/diegodella1/pricebtc/pull/36  
**Branch:** `cursor/fix-sponsors-copy-p0-aab5`  
**Commits:** 2 (P0 copy + EXP-01 conversion)  
**Status:** ✅ CI GREEN
