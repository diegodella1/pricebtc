# Sponsors Page Copy Changes - Before/After

## Problem Statement
The live `/sponsors` page at https://priceb.tc/sponsors displayed outdated copy referencing Lightning invoices and waitlist-primary flow, when the actual product is crypto claim (BTC/USDT/USDC) with Phase 2 auto-watch.

## Changes Summary

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

## Notes

- **English-only:** No Spanish in production strings
- **Copy-only changes:** No payment logic, watcher code, or business model modifications
- **Conditional messages preserved:** Messages shown when crypto IS disabled remain as "opening soon" (failsafe text)
- **Waitlist remains secondary:** Available when crypto is enabled, but not the headline framing

## PR

https://github.com/diegodella1/pricebtc/pull/36

Branch: `cursor/fix-sponsors-copy-p0-aab5`
