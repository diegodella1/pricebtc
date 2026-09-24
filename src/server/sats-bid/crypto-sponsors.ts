import { randomUUID } from "node:crypto";
import type pg from "pg";
import { BidError } from "./domain.js";
import type { BidConfig } from "./config.js";
import { transaction, type Sql } from "./db.js";

export type AssetType = "USDT_TRC20" | "USDC_SOL" | "BTC";

export interface CryptoSponsor {
  id: string;
  session_id: string;
  participant_id: string | null;
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id: string | null;
  asset_type: AssetType;
  deposit_address: string;
  tx_hash: string;
  amount_units: string;
  amount_usd: string;
  btc_usd_rate: string | null;
  validation_status: "pending" | "validating" | "confirmed" | "rejected" | "failed";
  confirmations: number;
  required_confirmations: number;
  explorer_data: object | null;
  validation_error: string | null;
  created_at: Date;
  validated_at: Date | null;
  confirmed_at: Date | null;
}

export interface AssetConfig {
  type: AssetType;
  address: string;
  minUsd: number;
  confirmations: number;
  label: string;
  network: string;
  warningMessage: string;
}

export function getAvailableAssets(config: BidConfig): AssetConfig[] {
  const assets: AssetConfig[] = [];

  if (config.SPONSOR_ADDR_USDT_TRC20) {
    assets.push({
      type: "USDT_TRC20",
      address: config.SPONSOR_ADDR_USDT_TRC20,
      minUsd: config.SPONSOR_MIN_USD_USDT,
      confirmations: config.SPONSOR_CONFIRM_USDT_TRC20,
      label: "USDT",
      network: "TRC20 (Tron)",
      warningMessage: "⚠️ Send only USDT on TRC20 network. Other networks will result in lost funds.",
    });
  }

  if (config.SPONSOR_ADDR_USDC_SOL) {
    assets.push({
      type: "USDC_SOL",
      address: config.SPONSOR_ADDR_USDC_SOL,
      minUsd: config.SPONSOR_MIN_USD_USDC,
      confirmations: config.SPONSOR_CONFIRM_USDC_SOL,
      label: "USDC",
      network: "Solana",
      warningMessage: "⚠️ Send only USDC on Solana network. Other networks will result in lost funds.",
    });
  }

  if (config.SPONSOR_ADDR_BTC) {
    assets.push({
      type: "BTC",
      address: config.SPONSOR_ADDR_BTC,
      minUsd: config.SPONSOR_MIN_USD_BTC,
      confirmations: config.SPONSOR_CONFIRM_BTC,
      label: "BTC",
      network: "Bitcoin Mainnet",
      warningMessage: "⚠️ Send only Bitcoin on mainnet. Testnet or other coins will result in lost funds.",
    });
  }

  return assets;
}

export interface CryptoPaymentInput {
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id?: string | null;
  asset_type: AssetType;
  tx_hash: string;
}

export async function createCryptoPayment(
  pool: pg.Pool,
  config: BidConfig,
  sessionId: string,
  input: CryptoPaymentInput,
  clock: () => Date = () => new Date(),
): Promise<CryptoSponsor> {
  const assets = getAvailableAssets(config);
  const asset = assets.find((a) => a.type === input.asset_type);

  if (!asset) {
    throw new BidError(
      "ASSET_UNAVAILABLE",
      "This payment method is not currently available.",
      422,
    );
  }

  if (!/^[a-fA-F0-9]{64}$/.test(input.tx_hash) && input.asset_type !== "BTC") {
    throw new BidError(
      "INVALID_TX_HASH",
      "Invalid transaction hash format.",
      422,
    );
  }

  if (input.asset_type === "BTC" && !/^[a-fA-F0-9]{64}$/.test(input.tx_hash)) {
    throw new BidError(
      "INVALID_TX_HASH",
      "Invalid Bitcoin transaction hash format.",
      422,
    );
  }

  const existing = await pool.query(
    "SELECT id, validation_status FROM crypto_sponsors WHERE asset_type=$1 AND deposit_address=$2 AND tx_hash=$3",
    [input.asset_type, asset.address, input.tx_hash],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0];
    throw new BidError(
      "DUPLICATE_TX",
      row.validation_status === "rejected"
        ? "This transaction was already rejected."
        : "This transaction has already been submitted.",
      409,
    );
  }

  return transaction(pool, async (sql) => {
    const id = randomUUID();

    await sql.query(
      `INSERT INTO crypto_sponsors(
        id, session_id, name, description, url, normalized_domain,
        logo_asset_id, asset_type, deposit_address, tx_hash,
        amount_units, amount_usd, required_confirmations,
        validation_status, confirmations, created_at
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '0', 0, $11, 'pending', 0, $12)`,
      [
        id,
        sessionId,
        input.name,
        input.description,
        input.url,
        input.normalized_domain,
        input.logo_asset_id || null,
        input.asset_type,
        asset.address,
        input.tx_hash,
        asset.confirmations,
        clock(),
      ],
    );

    const result = await sql.query<CryptoSponsor>(
      "SELECT * FROM crypto_sponsors WHERE id=$1",
      [id],
    );

    return result.rows[0];
  });
}

export async function getCryptoPayment(
  pool: pg.Pool,
  id: string,
): Promise<CryptoSponsor | null> {
  const result = await pool.query<CryptoSponsor>(
    "SELECT * FROM crypto_sponsors WHERE id=$1",
    [id],
  );
  return result.rows[0] || null;
}

export async function validateTronscanTx(
  config: BidConfig,
  address: string,
  txHash: string,
): Promise<{ amount: string; confirmations: number; valid: boolean; error?: string }> {
  const url = `${config.TRONSCAN_API_URL}/api/transaction-info?hash=${txHash}`;
  const headers: Record<string, string> = {};
  if (config.TRONSCAN_API_KEY) {
    headers["TRON-PRO-API-KEY"] = config.TRONSCAN_API_KEY;
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    return { amount: "0", confirmations: 0, valid: false, error: "Explorer API error" };
  }

  const data = await response.json();

  if (!data.confirmed || data.contractRet !== "SUCCESS") {
    return { amount: "0", confirmations: data.confirmations || 0, valid: false, error: "Transaction not confirmed" };
  }

  const recipient = data.trigger_info?.parameter?._to;
  if (!recipient || recipient.toLowerCase() !== address.toLowerCase()) {
    return { amount: "0", confirmations: data.confirmations || 0, valid: false, error: "Wrong recipient address" };
  }

  const amount = data.trigger_info?.parameter?._value || "0";
  return { amount, confirmations: data.confirmations || 0, valid: true };
}

export async function validateSolanaTx(
  config: BidConfig,
  address: string,
  signature: string,
): Promise<{ amount: string; confirmations: number; valid: boolean; error?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.SOLANA_RPC_TOKEN) {
    headers["Authorization"] = `Bearer ${config.SOLANA_RPC_TOKEN}`;
  }

  const txResponse = await fetch(config.SOLANA_RPC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { commitment: "finalized", maxSupportedTransactionVersion: 0 }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!txResponse.ok) {
    return { amount: "0", confirmations: 0, valid: false, error: "RPC error" };
  }

  const txData = await txResponse.json();
  if (txData.error || !txData.result) {
    return { amount: "0", confirmations: 0, valid: false, error: "Transaction not found" };
  }

  const heightResponse = await fetch(config.SOLANA_RPC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getBlockHeight" }),
  });

  const heightData = await heightResponse.json();
  const currentHeight = heightData.result || 0;
  const txSlot = txData.result.slot || 0;
  const confirmations = Math.max(0, currentHeight - txSlot);

  const postBalances = txData.result.meta?.postTokenBalances || [];
  const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const usdcBalance = postBalances.find(
    (b: { mint: string; owner: string }) =>
      b.mint === usdcMint && b.owner.toLowerCase() === address.toLowerCase()
  );

  if (!usdcBalance) {
    return { amount: "0", confirmations, valid: false, error: "No USDC transfer to recipient" };
  }

  const amount = usdcBalance.uiAmount ? String(Math.floor(usdcBalance.uiAmount * 1_000_000)) : "0";
  return { amount, confirmations, valid: true };
}

export async function validateBitcoinTx(
  config: BidConfig,
  address: string,
  txHash: string,
  btcPriceUsd: number,
): Promise<{ amount: string; amountUsd: number; confirmations: number; valid: boolean; error?: string }> {
  const txUrl = `${config.BITCOIN_EXPLORER_URL}/tx/${txHash}`;
  const txResponse = await fetch(txUrl, { signal: AbortSignal.timeout(10000) });

  if (!txResponse.ok) {
    return { amount: "0", amountUsd: 0, confirmations: 0, valid: false, error: "Transaction not found" };
  }

  const txData = await txResponse.json();

  if (!txData.status?.confirmed) {
    return { amount: "0", amountUsd: 0, confirmations: 0, valid: false, error: "Not confirmed" };
  }

  const tipResponse = await fetch(`${config.BITCOIN_EXPLORER_URL}/blocks/tip/height`);
  const tipHeight = await tipResponse.json();
  const confirmations = tipHeight - txData.status.block_height + 1;

  const output = txData.vout?.find((o: { scriptpubkey_address: string }) =>
    o.scriptpubkey_address === address
  );

  if (!output) {
    return { amount: "0", amountUsd: 0, confirmations, valid: false, error: "No payment to deposit address" };
  }

  const satoshis = output.value || 0;
  const btc = satoshis / 100_000_000;
  const amountUsd = btc * btcPriceUsd;

  return { amount: String(satoshis), amountUsd, confirmations, valid: true };
}
