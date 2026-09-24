import type pg from "pg";
import type { BidConfig } from "./config.js";
import {
  validateTronscanTx,
  validateSolanaTx,
  validateBitcoinTx,
  getAvailableAssets,
} from "./crypto-sponsors.js";

export async function runCryptoValidationWorker(
  pool: pg.Pool,
  config: BidConfig,
  getBtcPrice: () => Promise<number>,
  clock: () => Date = () => new Date(),
) {
  const assets = getAvailableAssets(config);
  if (assets.length === 0) {
    return;
  }

  const pending = await pool.query(
    `SELECT id, asset_type, deposit_address, tx_hash, required_confirmations, validation_status
     FROM crypto_sponsors
     WHERE validation_status IN ('pending', 'validating')
     ORDER BY created_at ASC
     LIMIT 10`,
  );

  for (const row of pending.rows) {
    try {
      await pool.query(
        "UPDATE crypto_sponsors SET validation_status='validating' WHERE id=$1",
        [row.id],
      );

      const asset = assets.find((a) => a.type === row.asset_type);
      if (!asset) {
        await pool.query(
          "UPDATE crypto_sponsors SET validation_status='failed', validation_error=$2 WHERE id=$1",
          [row.id, "Asset configuration not found"],
        );
        continue;
      }

      let result: {
        amount: string;
        amountUsd?: number;
        confirmations: number;
        valid: boolean;
        error?: string;
      };

      if (row.asset_type === "USDT_TRC20") {
        result = await validateTronscanTx(config, row.deposit_address, row.tx_hash);
        if (result.valid) {
          const amountUsdt = Number(result.amount) / 1_000_000;
          result.amountUsd = amountUsdt;
        }
      } else if (row.asset_type === "USDC_SOL") {
        result = await validateSolanaTx(config, row.deposit_address, row.tx_hash);
        if (result.valid) {
          const amountUsdc = Number(result.amount) / 1_000_000;
          result.amountUsd = amountUsdc;
        }
      } else if (row.asset_type === "BTC") {
        const btcPrice = await getBtcPrice();
        result = await validateBitcoinTx(config, row.deposit_address, row.tx_hash, btcPrice);
      } else {
        throw new Error(`Unknown asset type: ${row.asset_type}`);
      }

      if (!result.valid) {
        await pool.query(
          "UPDATE crypto_sponsors SET validation_status='rejected', validation_error=$2, confirmations=$3, validated_at=$4 WHERE id=$1",
          [row.id, result.error || "Validation failed", result.confirmations, clock()],
        );
        continue;
      }

      if (result.confirmations < row.required_confirmations) {
        await pool.query(
          "UPDATE crypto_sponsors SET validation_status='pending', confirmations=$2, validated_at=$3 WHERE id=$1",
          [row.id, result.confirmations, clock()],
        );
        continue;
      }

      const amountUsd = result.amountUsd || 0;
      if (amountUsd < asset.minUsd) {
        await pool.query(
          "UPDATE crypto_sponsors SET validation_status='rejected', validation_error=$2, confirmations=$3, amount_usd=$4, validated_at=$5 WHERE id=$1",
          [
            row.id,
            `Amount below minimum $${asset.minUsd.toFixed(2)} USD`,
            result.confirmations,
            amountUsd.toFixed(2),
            clock(),
          ],
        );
        continue;
      }

      await pool.query("BEGIN");
      try {
        const btcRate = row.asset_type === "BTC" ? await getBtcPrice() : null;

        await pool.query(
          `UPDATE crypto_sponsors 
           SET validation_status='confirmed', 
               confirmations=$2, 
               amount_units=$3, 
               amount_usd=$4, 
               btc_usd_rate=$5,
               validated_at=$6,
               confirmed_at=$6
           WHERE id=$1`,
          [
            row.id,
            result.confirmations,
            result.amount,
            amountUsd.toFixed(2),
            btcRate ? btcRate.toFixed(2) : null,
            clock(),
          ],
        );

        const sponsor = await pool.query(
          "SELECT * FROM crypto_sponsors WHERE id=$1",
          [row.id],
        );

        if (sponsor.rows[0].participant_id) {
          await pool.query(
            `INSERT INTO sponsor_usd_totals (participant_id, total_usd, payment_count, last_payment_at, updated_at)
             VALUES ($1, $2, 1, $3, $3)
             ON CONFLICT (participant_id) DO UPDATE
             SET total_usd = sponsor_usd_totals.total_usd + EXCLUDED.total_usd,
                 payment_count = sponsor_usd_totals.payment_count + 1,
                 last_payment_at = EXCLUDED.last_payment_at,
                 updated_at = EXCLUDED.updated_at`,
            [sponsor.rows[0].participant_id, amountUsd.toFixed(2), clock()],
          );
        }

        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error(`Validation error for crypto payment ${row.id}:`, error);
      await pool.query(
        "UPDATE crypto_sponsors SET validation_status='failed', validation_error=$2 WHERE id=$1",
        [row.id, (error as Error).message],
      );
    }
  }
}

export function startCryptoValidationWorker(
  pool: pg.Pool,
  config: BidConfig,
  getBtcPrice: () => Promise<number>,
  intervalMs = 30000,
) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runCryptoValidationWorker(pool, config, getBtcPrice);
    } catch (error) {
      console.error("Crypto validation worker error:", error);
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(run, intervalMs);

  return () => clearInterval(interval);
}
