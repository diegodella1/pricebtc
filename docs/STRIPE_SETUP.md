# Stripe Integration Setup Guide

This guide explains how to complete the Stripe setup for pricebtc API monetization.

## Prerequisites

- Stripe account (use Test mode first)
- Database configured (same DATABASE_URL as sats-bid feature)

## Stripe Dashboard Setup

### 1. Create Products and Prices

In the Stripe Dashboard (test mode):

**Product: Pro Plan**
- Name: "Pro Plan"
- Create two prices:
  - Monthly: $29/month (recurring)
  - Yearly: $290/year (recurring)
- Copy the Price IDs (format: `price_xxxxx`)

**Product: Business Plan**
- Name: "Business Plan"  
- Create two prices:
  - Monthly: $149/month (recurring)
  - Yearly: $1490/year (recurring)
- Copy the Price IDs (format: `price_xxxxx`)

### 2. Configure Webhook Endpoint

1. Go to Developers → Webhooks in Stripe Dashboard
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
4. Copy the Webhook signing secret (format: `whsec_xxxxx`)

### 3. Get API Keys

1. Go to Developers → API keys
2. Copy the **Secret key** (format: `sk_test_xxxxx` for test mode)
3. Copy the **Publishable key** (format: `pk_test_xxxxx` for test mode)

## Environment Variables

Add these to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Price IDs from Stripe Dashboard
STRIPE_PRICE_PRO_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_PRO_YEARLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_BUSINESS_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_BUSINESS_YEARLY=price_xxxxxxxxxxxxx

# Site URL (used for checkout redirect URLs)
PUBLIC_SITE_URL=https://your-domain.com

# Database (reuses same database as sats-bid)
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

## Database Migration

Run the migration to create the necessary tables:

```bash
# If using the sats-bid migration system
tsx scripts/sats-db.ts
```

The migration creates:
- `users` - User accounts linked to Stripe customers
- `subscriptions` - Active subscription records
- `api_keys` - API keys for Pro/Business tier access
- `api_usage` - Usage tracking per API key

## Testing Checkout Flow

1. Start the server: `npm run dev`
2. Visit `/pricing`
3. Click "Start Pro trial" or "Start Business trial"
4. Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date
   - Any 3-digit CVC
   - Any billing ZIP code
5. Complete checkout
6. Check server logs for webhook processing

## Going Live

When ready for production:

1. Switch Stripe account to **Live mode**
2. Create products/prices in Live mode
3. Update webhook endpoint to production URL
4. Update environment variables with live keys (format: `sk_live_`, `pk_live_`)
5. Test thoroughly before announcing

## API Key Management (Future)

After the initial integration is working, you can add:

- Dashboard page for users to manage API keys
- API key generation endpoint
- Rate limiting middleware based on tier
- Usage tracking and billing alerts

## Rate Limits by Tier

- Free: 120 requests/minute (existing)
- Pro: 1,000 requests/minute
- Business: 10,000 requests/minute

## Customer Portal

Users can manage their subscription at:
`/api/stripe/create-portal-session`

This redirects to Stripe's hosted portal where they can:
- Update payment method
- Change subscription plan
- Cancel subscription
- View invoices

## Support

For Stripe integration issues:
- Check server logs for webhook processing errors
- Use Stripe Dashboard → Developers → Events to see webhook delivery status
- Test with Stripe CLI for local webhook testing: `stripe listen --forward-to localhost:3466/api/stripe/webhook`
