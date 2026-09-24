import type pg from "pg";
import type { BidConfig } from "./config.js";
import { randomUUID } from "node:crypto";
import {
  validateTronscanTx,
  validateSolanaTx,
  validateBitcoinTx,
  getAvailableAssets,
} from "./crypto-sponsors.js";

async function ensureCryptoParticipant(
  pool: pg.Pool,
  config: BidConfig,
  sponsor: {
    id: string;
    session_id: string;
    name: string;
    description: string;
    url: string;
    normalized_domain: string;
    logo_asset_id: string | null;
  },
  clock: () => Date,
): Promise<string> {
  const roundResult = await pool.query(
    `SELECT id FROM rounds 
     WHERE date = CURRENT_DATE 
     ORDER BY created_at DESC 
     LIMIT 1`,
  );

  let roundId: string;
  if (!roundResult.rowCount || roundResult.rowCount === 0) {
    roundId = randomUUID();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await pool.query(
      "INSERT INTO rounds(id, date, starts_at, ends_at) VALUES($1, $2, $3, $4) ON CONFLICT(date) DO UPDATE SET date=excluded.date RETURNING id",
      [roundId, today.toISOString().slice(0, 10), today, tomorrow],
    );
  } else {
    roundId = roundResult.rows[0].id;
  }

  const blocked = await pool.query(
    "SELECT 1 FROM blocked_domains WHERE disabled_at IS NULL AND (normalized_domain=$1 OR (include_subdomains AND right($1,length(normalized_domain)+1)='.'||normalized_domain))",
    [sponsor.normalized_domain],
  );

  const status = blocked.rowCount
    ? "rejected"
    : config.MODERATION_MODE === "manual" ||
        /\b(casino|porn|guaranteed profit|double your bitcoin|seed phrase)\b/i.test(
          `${sponsor.name} ${sponsor.description}`,
        )
      ? "pending"
      : "approved";

  const existingParticipant = await pool.query(
    "SELECT id FROM participants WHERE session_id=$1 AND round_id=$2",
    [sponsor.session_id, roundId],
  );

  let participantId: string;

  if (existingParticipant.rowCount && existingParticipant.rowCount > 0) {
    participantId = existingParticipant.rows[0].id;

    await pool.query(
      `UPDATE participants 
       SET name=$1, description=$2, url=$3, normalized_domain=$4, 
           logo_asset_id=$5, moderation_status=$6, updated_at=$7 
       WHERE id=$8`,
      [
        sponsor.name,
        sponsor.description,
        sponsor.url,
        sponsor.normalized_domain,
        sponsor.logo_asset_id,
        status,
        clock(),
        participantId,
      ],
    );
  } else {
    participantId = randomUUID();

    await pool.query(
      `INSERT INTO participants(id, session_id, round_id, name, description, url, normalized_domain, logo_asset_id, moderation_status, rules_version, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
      [
        participantId,
        sponsor.session_id,
        roundId,
        sponsor.name,
        sponsor.description,
        sponsor.url,
        sponsor.normalized_domain,
        sponsor.logo_asset_id,
        status,
        config.RULES_VERSION,
        clock(),
      ],
    );
  }

  return participantId;
}

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

        const participantId = await ensureCryptoParticipant(
          pool,
          config,
          sponsor.rows[0],
          clock,
        );

        await pool.query(
          "UPDATE crypto_sponsors SET participant_id=$2 WHERE id=$1",
          [row.id, participantId],
        );

        await pool.query(
          `INSERT INTO sponsor_usd_totals (participant_id, total_usd, payment_count, last_payment_at, updated_at)
           VALUES ($1, $2, 1, $3, $3)
           ON CONFLICT (participant_id) DO UPDATE
           SET total_usd = sponsor_usd_totals.total_usd + EXCLUDED.total_usd,
               payment_count = sponsor_usd_totals.payment_count + 1,
               last_payment_at = EXCLUDED.last_payment_at,
               updated_at = EXCLUDED.updated_at`,
          [participantId, amountUsd.toFixed(2), clock()],
        );

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
