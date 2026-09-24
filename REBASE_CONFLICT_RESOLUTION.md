# Rebase Conflict Resolution — PR#36 onto main@7ff8363

**Date:** 2026-09-24  
**Base:** `main@7ff836327ea0599e6f6a3ad2484a7330ea708f60` (PR#37 merged)  
**Branch:** `cursor/fix-sponsors-copy-p0-aab5`  
**Final SHA:** `8d829b1065357063f4e5969da1e69ba5e0a13c40`  

---

## Conflict Summary

### File: `src/client/sats-bid/crypto-claim.tsx`

**Conflict Location:** Lines 86-105 (approx)

**PR#37 Changes (HEAD):**
- Added `resumePayment()` function for payment session restoration
- Enables `?payment=<id>` URL param to resume watching an existing payment
- Calls `startPolling(paymentId)` after resuming

**This PR Changes (cursor/fix-sponsors-copy-p0-aab5):**
- Added GA4 tracking `useEffect` for `claim_start` event
- Fires once when user enters identity step
- Uses `claimStartTracked` ref to prevent duplicate tracking

**Resolution:**
✅ **Preserved BOTH changes**
- Moved `resumePayment` before the useEffect that calls it
- Wrapped `resumePayment` and `startPolling` in `useCallback` to fix React hook dependency warnings
- Both functions coexist cleanly
- Payment resume flow + GA4 tracking both functional

---

## Additional Fixes Required

### Fix 1: Merge Conflict Markers
**Issue:** First rebase pass left conflict markers (`<<<<<<<`, `>>>>>>>`) in the file  
**Fix:** Removed markers, committed proper merge with both features intact  
**Commit:** `f72b961` - "fix: resolve merge conflict from rebase"

### Fix 2: Smoke Test Update for EXP-02
**Issue:** Browser smoke test expected `/sponsors` to show "TOP 21 SPONSORS." but EXP-02 changed default view to claim  
**Changes Made:**
- `/sponsors` (no hash) → expects "CLAIM YOUR SPOT." (claim view)
- `/sponsors#board` → expects "TOP 21 SPONSORS." (board view)
- Removed `/sponsors#waitlist` test (redirects to #claim when crypto ON)
- Moved 21-ranking count check to `#board` route
**Commit:** `8d829b1` - "fix: update smoke test for EXP-02 claim-first routing"

---

## Preserved PR#37 Features

✅ **Payment Resume Flow:**
- `resumePayment(paymentId)` function
- Checks `?payment=` URL param and `localStorage`
- Restores payment status and continues polling
- Fallback: clears localStorage on error

✅ **Credit Path UX:**
- `btcPriceUsd` in config for BTC amount display
- `confirmationWaitMessage` per asset type
- Participant credit display
- Watch CSS improvements

---

## Preserved This PR Features

✅ **P0 Copy Fixes:**
- Lightning → crypto language
- Waitlist → claim copy
- Meta descriptions updated

✅ **EXP-01 Conversion:**
- Primary nav → `/sponsors#claim`
- Home 3rd CTA when crypto enabled
- Removed competing waitlist CTA

✅ **EXP-02 UX Wire:**
- Claim-first default landing
- Canonical `#board` hash for leaderboard
- `#waitlist` redirects to `#claim`
- "← Top 21 leaderboard" back link
- Empty hash = claim (not board)
- Home empties → `/sponsors#claim`

✅ **SEO P0:**
- Removed noindex header
- Sitemap + llms.txt inclusion
- Strong SSR content + H1
- JSON-LD (WebPage + Offer + Organization)

✅ **GA4 Events:**
- `sponsors_view` (board load)
- `claim_start` (enter identity step) ← **conflict resolved here**
- `watching_intent` (I've sent payment)
- `deposit_confirmed` (payment confirmed)

---

## Validation

### Local Checks
✅ `npm run typecheck` — No errors  
✅ `npm run lint` — No warnings (resolved React hook dependencies)  
✅ `npm test` — 107 passed | 30 skipped  

### CI Checks (Run #36069984070)
✅ **Validate:** SUCCESS  
✅ **Deployment browser smoke:** PASS  
  - Home page OK
  - `/sponsors` → "CLAIM YOUR SPOT." ✓
  - `/sponsors#board` → "TOP 21 SPONSORS." + 21 rankings ✓
  - All other pages OK

### Final PR Status
- **mergeable:** `MERGEABLE`
- **mergeStateStatus:** `CLEAN` (was `BLOCKED` / `DIRTY` before rebase)
- **statusCheckRollup:** `SUCCESS`

---

## Commits Added During Rebase

1. **f72b961** - "fix: resolve merge conflict from rebase - preserve PR#37 resumePayment + GA4 tracking"
   - Properly merged `resumePayment` + `claimStart` tracking
   - Wrapped functions in `useCallback`

2. **8d829b1** - "fix: update smoke test for EXP-02 claim-first routing"
   - Updated browser smoke test for new default view
   - `/sponsors` → claim, `/sponsors#board` → board

---

## No Code Dropped

✅ **Zero regressions from PR#37**  
✅ **All EXP-02 features preserved**  
✅ **All GA4 events functional**  
✅ **Payment resume flow intact**  

**Merge-ready:** Yes, Validate is green, PR is `CLEAN`.
