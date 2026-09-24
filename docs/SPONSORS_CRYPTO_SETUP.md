# Sponsors Crypto Wallet Setup

This document describes the manual setup required for crypto sponsorship payments.

## Overview

The crypto wallet sponsorship system supports three assets:
- **USDT** on TRC20 (Tron network)
- **USDC** on Solana
- **BTC** on-chain (Bitcoin mainnet)

Payments are tracked via transaction hash submission, validated against public blockchain explorers, and ranked by cumulative USD value on the Top 21 leaderboard.

## Environment Variables

### Required Deposit Addresses

Set one or more of these addresses to enable crypto payments. **NEVER commit real addresses to version control.**

```bash
# Crypto deposit addresses (use placeholders in .env.example)
SPONSOR_ADDR_USDT_TRC20=   # Tron TRC20 address (e.g., TXxx...xxx)
SPONSOR_ADDR_USDC_SOL=     # Solana address (e.g., xxx...xxx base58)
SPONSOR_ADDR_BTC=          # Bitcoin address (e.g., bc1q... or 1... or 3...)
```

**If all three are empty**: The Claim flow redirects to the waitlist with "Payments opening soon..."

**If some are set**: Only those assets appear in the asset selection step.

### Currently Configured Production Addresses

For reference, these are the addresses currently set in production:

```
SPONSOR_ADDR_USDC_SOL=6qRGFDj5ySnqYu5KDpDpUenqxzS2dtnyRLhmKtAGvoMs
SPONSOR_ADDR_BTC=bc1qpcf3cludfwwu3jez7j7f406ck8psmne5cypkhf
SPONSOR_ADDR_USDT_TRC20=(not yet configured - asset disabled until set)
```

**⚠️ Note**: These addresses are documented here for operational reference only. NEVER hardcode them in client-side code. The UI must always fetch addresses from the backend API (`/crypto-sponsors/config`).

### Minimum Amounts (Optional)

```bash
SPONSOR_MIN_USD_USDT=10.00      # Default: 10 USD
SPONSOR_MIN_USD_USDC=10.00      # Default: 10 USD
SPONSOR_MIN_USD_BTC=10.00       # Default: 10 USD
```

### Confirmations Required (Optional)

```bash
SPONSOR_CONFIRM_USDT_TRC20=19   # Default: 19 confirmations for Tron
SPONSOR_CONFIRM_USDC_SOL=32     # Default: 32 confirmations for Solana
SPONSOR_CONFIRM_BTC=3           # Default: 3 confirmations for Bitcoin
```

### Explorer API Configuration (Optional)

```bash
# Tronscan API for USDT TRC20 validation
TRONSCAN_API_URL=https://apilist.tronscan.org
TRONSCAN_API_KEY=              # Optional, improves rate limits

# Solana RPC for USDC validation
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_RPC_TOKEN=              # Optional for private RPC

# Bitcoin explorer for BTC validation (mempool.space API)
BITCOIN_EXPLORER_URL=https://mempool.space/api
```

## Database Schema

### Manual SQL Migration

**⚠️ IMPORTANT**: Do NOT add these as auto-run migrations to avoid Pi deployment issues.

Run this SQL manually in your production database after deployment:

```sql
-- Crypto payment types and asset tracking
CREATE TABLE IF NOT EXISTS crypto_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES participant_sessions(id),
  participant_id uuid REFERENCES participants(id),
  
  -- Identity (copied from participant or new)
  name text NOT NULL,
  description text NOT NULL,
  url text NOT NULL,
  normalized_domain text NOT NULL,
  logo_asset_id uuid REFERENCES assets(id),
  
  -- Crypto payment details
  asset_type text NOT NULL CHECK(asset_type IN ('USDT_TRC20', 'USDC_SOL', 'BTC')),
  deposit_address text NOT NULL,
  tx_hash text NOT NULL,
  amount_units text NOT NULL, -- Amount in asset's base units (e.g., "100000000" for 1 USDT)
  amount_usd numeric(12,2) NOT NULL, -- USD value at confirmation
  btc_usd_rate numeric(12,2), -- BTC price in USD at confirmation (NULL for stablecoins)
  
  -- Validation state
  validation_status text NOT NULL DEFAULT 'pending' CHECK(validation_status IN ('pending', 'validating', 'confirmed', 'rejected', 'failed')),
  confirmations integer DEFAULT 0,
  required_confirmations integer NOT NULL,
  
  -- Explorer response
  explorer_data jsonb,
  validation_error text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  confirmed_at timestamptz,
  
  -- Unique transaction per address
  UNIQUE(asset_type, deposit_address, tx_hash)
);

CREATE INDEX idx_crypto_sponsors_session ON crypto_sponsors(session_id);
CREATE INDEX idx_crypto_sponsors_validation ON crypto_sponsors(validation_status, created_at) 
  WHERE validation_status IN ('pending', 'validating');
CREATE INDEX idx_crypto_sponsors_participant ON crypto_sponsors(participant_id) 
  WHERE participant_id IS NOT NULL;

-- Cumulative USD totals for leaderboard
CREATE TABLE IF NOT EXISTS sponsor_usd_totals (
  participant_id uuid PRIMARY KEY REFERENCES participants(id),
  total_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK(total_usd >= 0),
  payment_count integer NOT NULL DEFAULT 0,
  last_payment_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sponsor_usd_totals_leaderboard ON sponsor_usd_totals(total_usd DESC) 
  WHERE total_usd > 0;

-- Polling cursor for validation worker
CREATE TABLE IF NOT EXISTS crypto_validation_cursor (
  id integer PRIMARY KEY DEFAULT 1 CHECK(id = 1),
  last_poll_at timestamptz NOT NULL DEFAULT now(),
  last_validated_id uuid,
  consecutive_errors integer NOT NULL DEFAULT 0
);

INSERT INTO crypto_validation_cursor (id) VALUES (1) ON CONFLICT DO NOTHING;
```

## Explorer APIs

### Tronscan API (USDT TRC20)

**Endpoint**: `GET /api/transaction-info?hash={txHash}`

**Response fields needed**:
- `confirmed`: boolean
- `contractRet`: "SUCCESS"
- `confirmations`: number
- `trigger_info.parameter._value`: amount in smallest units
- `trigger_info.parameter._to`: recipient address

**Rate limits**: ~5 req/s public, higher with API key

**Docs**: https://github.com/tronscan/tronscan-frontend/blob/master/document/api.md

### Solana RPC (USDC SPL)

**Method**: `getTransaction` with JSON-RPC

**Parameters**:
- `signature`: transaction hash
- `commitment`: "finalized"
- `maxSupportedTransactionVersion`: 0

**Response parsing**:
- `result.slot`: block slot
- `result.meta.postTokenBalances`: find USDC mint and recipient
- `result.blockTime`: timestamp

**Confirmation check**: `getBlockHeight` - slot >= 32 confirmations

**Rate limits**: Public ~100 req/s, varies by RPC provider

**Docs**: https://docs.solana.com/developing/clients/jsonrpc-api

### Mempool.space API (Bitcoin)

**Endpoint**: `GET /tx/{txHash}`

**Response fields**:
- `status.confirmed`: boolean
- `status.block_height`: confirmation height
- `vout[]`: outputs array with addresses and values in satoshis

**Current height**: `GET /blocks/tip/height`

**Confirmations**: tip height - tx block height + 1

**Rate limits**: ~10 req/s public

**Docs**: https://mempool.space/docs/api/rest

## Deployment Notes

1. **Set environment variables** in your hosting platform (Railway, Render, Vercel, etc.)
2. **Run the manual SQL** above in your production database
3. **Restart the application** to load new config
4. **Start the validation worker** (if using separate process): `npm run worker`
5. **Monitor logs** for validation errors and rate limiting

## Testing

### Test with testnets first:

```bash
# Tron Nile testnet
TRONSCAN_API_URL=https://nileapi.tronscan.org
SPONSOR_ADDR_USDT_TRC20=<nile_testnet_address>

# Solana devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Bitcoin testnet
BITCOIN_EXPLORER_URL=https://mempool.space/testnet/api
SPONSOR_ADDR_BTC=<testnet_address>
```

### Verify the flow:

1. Visit `/sponsors` - should show Claim button if ≥1 address configured
2. Complete Step 1 (identity)
3. Choose asset in Step 2
4. Submit transaction hash in Step 3
5. Wait for validation (check `/api/crypto-sponsors/status/:id`)
6. Verify leaderboard shows USD amount on success

## Security Considerations

- **Never expose private keys** - only deposit addresses
- **Validate amounts match minimum** before accepting
- **Check addresses match exactly** (case-sensitive for Bitcoin, case-insensitive for Solana)
- **Rate limit tx hash submissions** (already implemented per session/IP)
- **Store USD value at confirmation time** to prevent price manipulation
- **Log all validation responses** for audit trail

## Troubleshooting

### "Payments opening soon..." shows when addresses are set

- Verify env vars are loaded: `console.log(process.env.SPONSOR_ADDR_BTC)`
- Restart server after changing environment variables
- Check config parsing in `src/server/sats-bid/config.ts`

### Transaction validation stuck at "pending"

- Check explorer API is reachable: `curl https://mempool.space/api/blocks/tip/height`
- Verify API keys are set correctly
- Check worker logs for rate limiting or errors
- Ensure worker process is running (not just main server)

### Wrong amount calculated

- Stablecoins: 1 USDT = 1,000,000 smallest units (6 decimals)
- BTC: 1 BTC = 100,000,000 satoshis (8 decimals)
- Verify decimal conversion in validation logic

### Leaderboard not updating after confirmation

- Check `sponsor_usd_totals` table was created
- Verify `participant_id` is set on `crypto_sponsors` row
- Ensure cumulative total is updating via trigger or manual update
