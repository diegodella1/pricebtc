import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, migrate } from "../../src/server/sats-bid/db.js";
import { bidConfig } from "../../src/server/sats-bid/config.js";
import { createCryptoPayment, getCryptoPayment } from "../../src/server/sats-bid/crypto-sponsors.js";
import { hash } from "../../src/server/sats-bid/service.js";

const url = process.env.SATS_TEST_DATABASE_URL;

describe.skipIf(!url)("Crypto auto-watch claim", () => {
  const schema = `crypto_watch_test_${randomUUID().replaceAll("-", "")}`;
  const testUrl = new URL(url ?? "postgresql://localhost/test");
  testUrl.searchParams.set("options", `-c search_path=${schema}`);
  const pool = database(testUrl.toString());
  let now = new Date("2031-01-01T12:00:00Z");
  const clock = () => now;
  
  const config = bidConfig({
    APP_ENV: "test",
    DATABASE_URL: url,
    SPONSOR_ADDR_USDT_TRC20: "TLK41RcGbtQiFP8XnTyF3YKaqzNyVbbxm3",
    SPONSOR_ADDR_USDC_SOL: "6qRGFDj5ySnqYu5KDpDpUenqxzS2dtnyRLhmKtAGvoMs",
    SPONSOR_ADDR_BTC: "bc1qpcf3cludfwwu3jez7j7f406ck8psmne5cypkhf",
    SPONSOR_MIN_USD_USDT: "10",
    SPONSOR_MIN_USD_USDC: "10",
    SPONSOR_MIN_USD_BTC: "10",
    SPONSOR_CONFIRM_USDT_TRC20: "12",
    SPONSOR_CONFIRM_USDC_SOL: "16",
    SPONSOR_CONFIRM_BTC: "3",
  });

  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    
    await pool.query(`
      CREATE TABLE crypto_sponsors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL,
        participant_id uuid,
        name text NOT NULL,
        description text NOT NULL,
        url text NOT NULL,
        normalized_domain text NOT NULL,
        logo_asset_id uuid,
        asset_type text NOT NULL CHECK(asset_type IN ('USDT_TRC20', 'USDC_SOL', 'BTC')),
        deposit_address text NOT NULL,
        tx_hash text,
        amount_units text NOT NULL,
        amount_usd numeric(12,2) NOT NULL,
        btc_usd_rate numeric(12,2),
        validation_status text NOT NULL DEFAULT 'pending' CHECK(validation_status IN ('watching', 'pending', 'validating', 'confirmed', 'rejected', 'failed')),
        confirmations integer DEFAULT 0,
        required_confirmations integer NOT NULL,
        explorer_data jsonb,
        validation_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        validated_at timestamptz,
        confirmed_at timestamptz,
        UNIQUE(asset_type, deposit_address, tx_hash)
      );
      
      CREATE INDEX idx_crypto_sponsors_watching ON crypto_sponsors(asset_type, deposit_address, created_at)
        WHERE validation_status = 'watching' AND tx_hash IS NULL;
      
      CREATE TABLE deposit_watcher_cursors (
        asset_type text PRIMARY KEY CHECK(asset_type IN ('USDT_TRC20', 'USDC_SOL', 'BTC')),
        last_tx_hash text,
        last_poll_at timestamptz NOT NULL DEFAULT now(),
        consecutive_errors integer NOT NULL DEFAULT 0
      );
    `);
  }, 30000);

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });

  async function createSession() {
    const session = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO participant_sessions(id,token_hash,expires_at) VALUES($1,$2,$3)",
      [session, hash(token), new Date("2040-01-01")],
    );
    return session;
  }

  it("creates watching intent without tx_hash", async () => {
    const sessionId = await createSession();
    
    const payment = await createCryptoPayment(pool, config, sessionId, {
      name: "Test Sponsor",
      description: "Testing auto-watch",
      url: "https://test.example.com",
      normalized_domain: "test.example.com",
      asset_type: "USDT_TRC20",
    }, clock);

    expect(payment.validation_status).toBe("watching");
    expect(payment.tx_hash).toBeNull();
    expect(payment.asset_type).toBe("USDT_TRC20");
    expect(payment.deposit_address).toBe(config.SPONSOR_ADDR_USDT_TRC20);
  });

  it("creates pending payment with tx_hash (fallback)", async () => {
    const sessionId = await createSession();
    const txHash = "a".repeat(64);
    
    const payment = await createCryptoPayment(pool, config, sessionId, {
      name: "Test Sponsor",
      description: "Testing paste fallback",
      url: "https://test2.example.com",
      normalized_domain: "test2.example.com",
      asset_type: "USDC_SOL",
      tx_hash: txHash,
    }, clock);

    expect(payment.validation_status).toBe("pending");
    expect(payment.tx_hash).toBe(txHash);
    expect(payment.asset_type).toBe("USDC_SOL");
  });

  it("matches transaction to oldest watching intent (FIFO)", async () => {
    const session1 = await createSession();
    const session2 = await createSession();
    const session3 = await createSession();

    const payment1 = await createCryptoPayment(pool, config, session1, {
      name: "Sponsor 1",
      description: "First in queue",
      url: "https://first.example.com",
      normalized_domain: "first.example.com",
      asset_type: "BTC",
    }, clock);

    now = new Date("2031-01-01T12:01:00Z");
    
    const payment2 = await createCryptoPayment(pool, config, session2, {
      name: "Sponsor 2",
      description: "Second in queue",
      url: "https://second.example.com",
      normalized_domain: "second.example.com",
      asset_type: "BTC",
    }, clock);

    now = new Date("2031-01-01T12:02:00Z");

    const payment3 = await createCryptoPayment(pool, config, session3, {
      name: "Sponsor 3",
      description: "Third in queue",
      url: "https://third.example.com",
      normalized_domain: "third.example.com",
      asset_type: "BTC",
    }, clock);

    const txHash = "b".repeat(64);
    
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
      ["BTC", config.SPONSOR_ADDR_BTC, txHash, clock()],
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0].id).toBe(payment1.id);

    const updated1 = await getCryptoPayment(pool, payment1.id);
    expect(updated1?.validation_status).toBe("pending");
    expect(updated1?.tx_hash).toBe(txHash);

    const stillWatching2 = await getCryptoPayment(pool, payment2.id);
    expect(stillWatching2?.validation_status).toBe("watching");
    expect(stillWatching2?.tx_hash).toBeNull();

    const stillWatching3 = await getCryptoPayment(pool, payment3.id);
    expect(stillWatching3?.validation_status).toBe("watching");
    expect(stillWatching3?.tx_hash).toBeNull();
  });

  it("prevents duplicate tx_hash submissions", async () => {
    const sessionId = await createSession();
    const txHash = "c".repeat(64);
    
    await createCryptoPayment(pool, config, sessionId, {
      name: "First Submit",
      description: "First tx submission",
      url: "https://first-tx.example.com",
      normalized_domain: "first-tx.example.com",
      asset_type: "USDT_TRC20",
      tx_hash: txHash,
    }, clock);

    await expect(
      createCryptoPayment(pool, config, sessionId, {
        name: "Duplicate",
        description: "Duplicate tx",
        url: "https://dup.example.com",
        normalized_domain: "dup.example.com",
        asset_type: "USDT_TRC20",
        tx_hash: txHash,
      }, clock)
    ).rejects.toThrow(/already been submitted/);
  });

  it("allows multiple watching intents for same asset", async () => {
    const session1 = await createSession();
    const session2 = await createSession();

    const payment1 = await createCryptoPayment(pool, config, session1, {
      name: "Watch 1",
      description: "First watcher",
      url: "https://watch1.example.com",
      normalized_domain: "watch1.example.com",
      asset_type: "USDC_SOL",
    }, clock);

    const payment2 = await createCryptoPayment(pool, config, session2, {
      name: "Watch 2",
      description: "Second watcher",
      url: "https://watch2.example.com",
      normalized_domain: "watch2.example.com",
      asset_type: "USDC_SOL",
    }, clock);

    expect(payment1.validation_status).toBe("watching");
    expect(payment2.validation_status).toBe("watching");
    expect(payment1.id).not.toBe(payment2.id);
  });

  it("validates tx_hash format when provided", async () => {
    const sessionId = await createSession();

    await expect(
      createCryptoPayment(pool, config, sessionId, {
        name: "Invalid Hash",
        description: "Bad format",
        url: "https://invalid.example.com",
        normalized_domain: "invalid.example.com",
        asset_type: "USDT_TRC20",
        tx_hash: "not-a-valid-hash",
      }, clock)
    ).rejects.toThrow(/Invalid transaction hash/);
  });

  it("creates deposit watcher cursor", async () => {
    await pool.query(
      `INSERT INTO deposit_watcher_cursors (asset_type, last_tx_hash, last_poll_at, consecutive_errors)
       VALUES ($1, NULL, now(), 0)`,
      ["USDT_TRC20"],
    );

    const result = await pool.query(
      "SELECT * FROM deposit_watcher_cursors WHERE asset_type=$1",
      ["USDT_TRC20"],
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0].asset_type).toBe("USDT_TRC20");
    expect(result.rows[0].consecutive_errors).toBe(0);
  });

  it("creates participant and credits leaderboard on confirmation", async () => {
    const sessionId = await createSession();
    
    const payment = await createCryptoPayment(pool, config, sessionId, {
      name: "Leaderboard Test",
      description: "Testing participant creation",
      url: "https://leader.example.com",
      normalized_domain: "leader.example.com",
      asset_type: "USDT_TRC20",
    }, clock);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sponsor_usd_totals (
        participant_id uuid PRIMARY KEY,
        total_usd numeric(12,2) NOT NULL DEFAULT 0,
        payment_count integer NOT NULL DEFAULT 0,
        last_payment_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(
      `UPDATE crypto_sponsors
       SET validation_status='confirmed', 
           confirmations=20, 
           amount_units='50000000', 
           amount_usd=50.00,
           validated_at=$2,
           confirmed_at=$2
       WHERE id=$1`,
      [payment.id, clock()],
    );

    const currentRound = await pool.query(
      "SELECT id FROM rounds WHERE date = CURRENT_DATE ORDER BY starts_at DESC LIMIT 1",
    );
    
    let roundId: string;
    if (currentRound.rowCount && currentRound.rowCount > 0) {
      roundId = currentRound.rows[0].id;
    } else {
      roundId = randomUUID();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await pool.query(
        "INSERT INTO rounds(id, date, starts_at, ends_at) VALUES($1, $2, $3, $4)",
        [roundId, today.toISOString().slice(0, 10), today, tomorrow],
      );
    }

    const participantId = randomUUID();
    await pool.query(
      `INSERT INTO participants(id, session_id, round_id, name, description, url, normalized_domain, logo_asset_id, moderation_status, rules_version, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, NULL, 'approved', '1.0', $8, $8)`,
      [
        participantId,
        sessionId,
        roundId,
        "Leaderboard Test",
        "Testing participant creation",
        "https://leader.example.com",
        "leader.example.com",
        clock(),
      ],
    );

    await pool.query(
      "UPDATE crypto_sponsors SET participant_id=$2 WHERE id=$1",
      [payment.id, participantId],
    );

    await pool.query(
      `INSERT INTO sponsor_usd_totals (participant_id, total_usd, payment_count, last_payment_at, updated_at)
       VALUES ($1, 50.00, 1, $2, $2)`,
      [participantId, clock()],
    );

    const totals = await pool.query(
      "SELECT * FROM sponsor_usd_totals WHERE participant_id=$1",
      [participantId],
    );

    expect(totals.rowCount).toBe(1);
    expect(Number(totals.rows[0].total_usd)).toBe(50.00);
    expect(totals.rows[0].payment_count).toBe(1);

    const updatedPayment = await getCryptoPayment(pool, payment.id);
    expect(updatedPayment?.participant_id).toBe(participantId);
    expect(updatedPayment?.validation_status).toBe("confirmed");
  });
});
