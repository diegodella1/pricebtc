import type pg from "pg";
import type { BidConfig } from "./config.js";
import type { AssetType } from "./crypto-sponsors.js";

interface DepositTransaction {
  txHash: string;
  amount: string;
  timestamp: number;
}

interface WatcherCursor {
  asset_type: AssetType;
  last_tx_hash: string | null;
  last_poll_at: Date;
  consecutive_errors: number;
}

async function getWatcherCursor(
  pool: pg.Pool,
  assetType: AssetType,
): Promise<WatcherCursor> {
  const result = await pool.query(
    "SELECT last_tx_hash, last_poll_at, consecutive_errors FROM deposit_watcher_cursors WHERE asset_type=$1",
    [assetType],
  );

  if (result.rowCount && result.rowCount > 0) {
    return {
      asset_type: assetType,
      last_tx_hash: result.rows[0].last_tx_hash,
      last_poll_at: result.rows[0].last_poll_at,
      consecutive_errors: result.rows[0].consecutive_errors,
    };
  }

  await pool.query(
    `INSERT INTO deposit_watcher_cursors (asset_type, last_tx_hash, last_poll_at, consecutive_errors)
     VALUES ($1, NULL, now(), 0)`,
    [assetType],
  );

  return {
    asset_type: assetType,
    last_tx_hash: null,
    last_poll_at: new Date(),
    consecutive_errors: 0,
  };
}

async function updateWatcherCursor(
  pool: pg.Pool,
  assetType: AssetType,
  lastTxHash: string | null,
  error: boolean = false,
): Promise<void> {
  if (error) {
    await pool.query(
      "UPDATE deposit_watcher_cursors SET last_poll_at=now(), consecutive_errors=consecutive_errors+1 WHERE asset_type=$1",
      [assetType],
    );
  } else {
    await pool.query(
      "UPDATE deposit_watcher_cursors SET last_tx_hash=$2, last_poll_at=now(), consecutive_errors=0 WHERE asset_type=$1",
      [assetType, lastTxHash],
    );
  }
}

async function matchTransactionToIntent(
  pool: pg.Pool,
  assetType: AssetType,
  depositAddress: string,
  txHash: string,
  clock: () => Date = () => new Date(),
): Promise<boolean> {
  const existing = await pool.query(
    "SELECT id FROM crypto_sponsors WHERE asset_type=$1 AND deposit_address=$2 AND tx_hash=$3",
    [assetType, depositAddress, txHash],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return false;
  }

  const result = await pool.query(
    `UPDATE crypto_sponsors
     SET tx_hash=$3, validation_status='pending', validated_at=$4
     WHERE id = (
       SELECT id FROM crypto_sponsors
       WHERE asset_type=$1 AND deposit_address=$2 AND validation_status='watching' AND tx_hash IS NULL
       ORDER BY created_at ASC
       LIMIT 1
     )
     RETURNING id`,
    [assetType, depositAddress, txHash, clock()],
  );

  return result.rowCount !== null && result.rowCount > 0;
}

async function fetchTronscanDeposits(
  config: BidConfig,
  address: string,
  cursor: WatcherCursor,
): Promise<DepositTransaction[]> {
  const url = `${config.TRONSCAN_API_URL}/api/token_trc20/transfers?relatedAddress=${address}&limit=20&sort=-timestamp`;
  const headers: Record<string, string> = {};
  if (config.TRONSCAN_API_KEY) {
    headers["TRON-PRO-API-KEY"] = config.TRONSCAN_API_KEY;
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Tronscan API error: ${response.status}`);
  }

  const data = await response.json();
  const transfers = data.token_transfers || [];

  const deposits: DepositTransaction[] = [];
  for (const transfer of transfers) {
    if (
      transfer.to_address?.toLowerCase() === address.toLowerCase() &&
      transfer.confirmed &&
      transfer.contract_address &&
      transfer.transaction_id
    ) {
      if (cursor.last_tx_hash && transfer.transaction_id === cursor.last_tx_hash) {
        break;
      }
      deposits.push({
        txHash: transfer.transaction_id,
        amount: transfer.quant || "0",
        timestamp: transfer.block_ts || Date.now(),
      });
    }
  }

  return deposits.reverse();
}

async function fetchSolanaDeposits(
  config: BidConfig,
  address: string,
  cursor: WatcherCursor,
): Promise<DepositTransaction[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.SOLANA_RPC_TOKEN) {
    headers["Authorization"] = `Bearer ${config.SOLANA_RPC_TOKEN}`;
  }

  const response = await fetch(config.SOLANA_RPC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [address, { limit: 20, commitment: "finalized" }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error || !data.result) {
    throw new Error(`Solana RPC error: ${data.error?.message || "Unknown"}`);
  }

  const signatures = data.result || [];
  const deposits: DepositTransaction[] = [];

  for (const sig of signatures) {
    if (cursor.last_tx_hash && sig.signature === cursor.last_tx_hash) {
      break;
    }

    if (!sig.err) {
      deposits.push({
        txHash: sig.signature,
        amount: "0",
        timestamp: sig.blockTime || Math.floor(Date.now() / 1000),
      });
    }
  }

  return deposits.reverse();
}

async function fetchBitcoinDeposits(
  config: BidConfig,
  address: string,
  cursor: WatcherCursor,
): Promise<DepositTransaction[]> {
  const url = `${config.BITCOIN_EXPLORER_URL}/address/${address}/txs`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    throw new Error(`Bitcoin explorer error: ${response.status}`);
  }

  const txs = await response.json();
  const deposits: DepositTransaction[] = [];

  for (const tx of txs) {
    if (cursor.last_tx_hash && tx.txid === cursor.last_tx_hash) {
      break;
    }

    const output = tx.vout?.find((o: { scriptpubkey_address: string }) =>
      o.scriptpubkey_address === address
    );

    if (output && output.value > 0) {
      deposits.push({
        txHash: tx.txid,
        amount: String(output.value),
        timestamp: tx.status?.block_time || Math.floor(Date.now() / 1000),
      });
    }
  }

  return deposits.reverse();
}

export async function runDepositWatchers(
  pool: pg.Pool,
  config: BidConfig,
  clock: () => Date = () => new Date(),
) {
  const watchers: Array<{
    asset: AssetType;
    address: string;
    fetcher: (config: BidConfig, address: string, cursor: WatcherCursor) => Promise<DepositTransaction[]>;
  }> = [];

  if (config.SPONSOR_ADDR_USDT_TRC20) {
    watchers.push({
      asset: "USDT_TRC20",
      address: config.SPONSOR_ADDR_USDT_TRC20,
      fetcher: fetchTronscanDeposits,
    });
  }

  if (config.SPONSOR_ADDR_USDC_SOL) {
    watchers.push({
      asset: "USDC_SOL",
      address: config.SPONSOR_ADDR_USDC_SOL,
      fetcher: fetchSolanaDeposits,
    });
  }

  if (config.SPONSOR_ADDR_BTC) {
    watchers.push({
      asset: "BTC",
      address: config.SPONSOR_ADDR_BTC,
      fetcher: fetchBitcoinDeposits,
    });
  }

  for (const watcher of watchers) {
    try {
      const cursor = await getWatcherCursor(pool, watcher.asset);

      if (cursor.consecutive_errors >= 5) {
        console.warn(`Skipping ${watcher.asset} watcher due to consecutive errors`);
        continue;
      }

      const deposits = await watcher.fetcher(config, watcher.address, cursor);

      for (const deposit of deposits) {
        const matched = await matchTransactionToIntent(
          pool,
          watcher.asset,
          watcher.address,
          deposit.txHash,
          clock,
        );

        if (matched) {
          console.log(
            `Matched ${watcher.asset} tx ${deposit.txHash} to watching intent`,
          );
        }
      }

      if (deposits.length > 0) {
        await updateWatcherCursor(pool, watcher.asset, deposits[deposits.length - 1].txHash);
      } else {
        await updateWatcherCursor(pool, watcher.asset, cursor.last_tx_hash);
      }
    } catch (error) {
      console.error(`Deposit watcher error for ${watcher.asset}:`, error);
      await updateWatcherCursor(pool, watcher.asset, null, true);
    }
  }
}

export function startDepositWatchers(
  pool: pg.Pool,
  config: BidConfig,
  intervalMs = 30000,
) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runDepositWatchers(pool, config);
    } catch (error) {
      console.error("Deposit watchers error:", error);
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, intervalMs);

  return () => clearInterval(interval);
}
