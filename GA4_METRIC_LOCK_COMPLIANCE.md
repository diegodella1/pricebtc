# GA4 Metric Lock Compliance — ConversionBot Wire

**Measurement ID:** `G-T9E3ZF3J0T`  
**PR:** [#36](https://github.com/diegodella1/pricebtc/pull/36)  
**Commit:** `a222b1b01a43417ace2b0287e2ec8482ca3c5b85`  
**Status:** ✅ Implemented per ConversionBot wire (exact placement)

---

## Event Wire (5 Events, No Extras)

### 1. `sponsors_view`
**Purpose:** Sponsors page/board session view  
**When:** Board load  
**Implementation:**
```typescript
// src/client/sats-bid/sponsors-page.tsx
if (view === "board") {
  GA4Events.sponsorsView();
}
```
**Fires on:** User navigates to `/sponsors#board`

---

### 2. `claim_start`
**Purpose:** Asset/claim shell shown (including auto-land #claim from EXP-02)  
**NOT:** Profile save (distinct event)  
**Implementation:**
```typescript
// src/client/sats-bid/sponsors-page.tsx
if (view === "claim") {
  GA4Events.claimStart();
}
```
**Fires on:**
- User lands on `/sponsors` (no hash) → EXP-02 auto-redirects to `#claim`
- User explicitly navigates to `/sponsors#claim`
- View state becomes "claim"

**NOT fired on:**
- Identity form submission (that's `profile_save`)
- Profile step (identity collection)

---

### 3. `profile_save` ✨ NEW
**Purpose:** Identity/logo saved  
**Distinct from:** `watching_intent` (per ConversionBot requirement)  
**Implementation:**
```typescript
// src/client/sats-bid/crypto-claim.tsx
const handleIdentitySubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  // ... upload logo ...
  GA4Events.profileSave();
  setStep("asset");
};
```
**Fires on:** Identity form submits successfully (after logo upload)

---

### 4. `watching_intent`
**Purpose:** "I've sent the payment" / watch session create ONLY  
**NEVER:** Fires on profile_save  
**Implementation:**
```typescript
// src/client/sats-bid/crypto-claim.tsx
const handleStartWatching = async () => {
  // ... create payment ...
  GA4Events.watchingIntent(selectedAsset.type);
  // ... start polling ...
};
```
**Fires on:** User clicks "I've sent the payment" button  
**Params:** `asset_type` (BTC/USDT_TRC20/USDC_SOL)

**NOT fired on:**
- Profile save
- Identity form submission
- Any other step

---

### 5. `deposit_confirmed`
**Purpose:** Payment confirmed/credited only  
**Implementation:**
```typescript
// src/client/sats-bid/crypto-claim.tsx
const startPolling = useCallback((id: string) => {
  // ... poll status ...
  if (status.validation_status === "confirmed") {
    GA4Events.depositConfirmed(status.asset_type, status.amount_usd);
    // ... cleanup ...
  }
}, [onComplete]);
```
**Fires on:** Payment validation status becomes "confirmed"  
**Params:** `asset_type`, `amount_usd`

---

## Event Sequence (Happy Path)

1. User lands on `/sponsors` (no hash)
   → EXP-02 redirects to `#claim`
   → **`claim_start`** fires

2. User fills identity form (name, logo, URL, description)
   → Clicks "Continue to payment →"
   → **`profile_save`** fires

3. User selects asset (BTC/USDT/USDC)
   → Sees payment address + QR
   → Clicks "I've sent the payment →"
   → **`watching_intent`** fires

4. Payment confirms on blockchain
   → Status becomes "confirmed"
   → **`deposit_confirmed`** fires

5. User clicks "← Top 21 leaderboard" or navigates to `/sponsors#board`
   → **`sponsors_view`** fires

---

## Compliance Checklist

✅ **sponsors_view** - Board session view only  
✅ **claim_start** - Asset/claim shell shown (NOT profile_save)  
✅ **profile_save** - NEW event, distinct from watching_intent  
✅ **watching_intent** - "I've sent payment" ONLY (NEVER profile_save)  
✅ **deposit_confirmed** - Payment confirmed/credited only  
✅ **No invented metrics** - Zero extra events  
✅ **EXP-03 excluded** - No step reordering in this PR  

---

## Code Locations

### Event Definitions
**File:** `src/client/lib/ga4.ts`
```typescript
export const GA4Events = {
  sponsorsView: () => trackEvent("sponsors_view"),
  claimStart: () => trackEvent("claim_start"),
  profileSave: () => trackEvent("profile_save"),
  watchingIntent: (assetType?: string) => 
    trackEvent("watching_intent", assetType ? { asset_type: assetType } : undefined),
  depositConfirmed: (assetType?: string, amountUsd?: string) => 
    trackEvent("deposit_confirmed", { 
      ...(assetType && { asset_type: assetType }),
      ...(amountUsd && { amount_usd: parseFloat(amountUsd) })
    }),
} as const;
```

### Event Triggers

**sponsors_view + claim_start:**
- `src/client/sats-bid/sponsors-page.tsx` (lines 109-113)
- Fires on view change

**profile_save:**
- `src/client/sats-bid/crypto-claim.tsx` (line 171)
- `handleIdentitySubmit` function

**watching_intent:**
- `src/client/sats-bid/crypto-claim.tsx` (line 211)
- `handleStartWatching` function

**deposit_confirmed:**
- `src/client/sats-bid/crypto-claim.tsx` (line 89)
- `startPolling` polling callback

---

## Changes from Initial Implementation

### Before (Incorrect)
- `claim_start` fired on identity step (`step === "identity"`)
- No `profile_save` event
- `watching_intent` correct (no change needed)

### After (ConversionBot Wire)
- `claim_start` fires when claim view shown (`view === "claim"`)
- **NEW** `profile_save` event when identity saved
- `watching_intent` unchanged (already correct)
- Removed `claimStartTracked` ref (no longer needed)

---

## Testing

### Local Validation
✅ TypeScript: No errors  
✅ ESLint: No warnings  
✅ Tests: 107 passed  

### CI Validation (Run #36070382952)
✅ Validate: SUCCESS  
✅ Browser smoke: PASS  

### Manual Test Script
```javascript
// Open console on https://priceb.tc/sponsors

// 1. Check claim_start on landing
// Should fire automatically when page loads with #claim

// 2. Fill identity form and submit
// Should see: profile_save

// 3. Select asset, click "I've sent the payment"
// Should see: watching_intent with asset_type param

// 4. Wait for payment confirmation
// Should see: deposit_confirmed with asset_type + amount_usd

// 5. Navigate to #board
// Should see: sponsors_view

// View in DevTools: Application > Storage > dataLayer
// Or: console.log(window.dataLayer)
```

---

## EXP-03 Note (Out of Scope)

**Not in this PR:**
- Step reorder: Asset → Pay → Watching → Profile
- Identity after payment (deferred collection)
- Payment status chrome during profile step

**Why excluded:**
- businessBot sequence: Ship EXP-01+02+SEO first
- Validate conversion lift before UX redesign
- ConversionBot metric lock applies to current flow only

**Current flow preserved:**
- Identity → Asset → Payment → Watching (PR #35)
- Profile save happens before payment (current UX)
- `profile_save` event tracks this step

---

## Summary

**ConversionBot Wire Compliance:** ✅ 100%  
**Events Implemented:** 5 (exact wire)  
**Invented Metrics:** 0  
**EXP-03 Contamination:** None  
**Ready for Production:** Yes  

**Next:** Deploy + smoke test → validate conversion funnel → EXP-03 PR (if lift confirmed)
