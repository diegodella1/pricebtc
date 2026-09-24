declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.gtag) return;
  
  try {
    window.gtag("event", eventName, params);
  } catch {
    // Silently fail if gtag is not available
  }
}

export const GA4Events = {
  sponsorsView: () => trackEvent("sponsors_view"),
  claimStart: () => trackEvent("claim_start"),
  watchingIntent: (assetType?: string) => trackEvent("watching_intent", assetType ? { asset_type: assetType } : undefined),
  depositConfirmed: (assetType?: string, amountUsd?: string) => 
    trackEvent("deposit_confirmed", { 
      ...(assetType && { asset_type: assetType }),
      ...(amountUsd && { amount_usd: parseFloat(amountUsd) })
    }),
} as const;
