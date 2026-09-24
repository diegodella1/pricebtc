import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { database, migrate } from "../../src/server/sats-bid/db.js";

describe.skipIf(!process.env.SATS_TEST_DATABASE_URL)("Stripe schema upgrade", () => {
  it("upgrades an existing schema without losing data and can be rerun", async () => {
    const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.SATS_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = database(url.toString());
    try {
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      for (const name of (await readdir("migrations")).filter(name => name.endsWith(".sql") && name < "005").sort()) {
        await pool.query(await readFile(`migrations/${name}`, "utf8"));
        await pool.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      }
      const id = randomUUID();
      await pool.query("INSERT INTO participant_sessions(id, token_hash, expires_at) VALUES($1, 'preserved-token', now() + interval '1 day')", [id]);
      await migrate(pool);
      await migrate(pool);
      expect((await pool.query("SELECT token_hash FROM participant_sessions WHERE id=$1", [id])).rows[0].token_hash).toBe("preserved-token");
      for (const table of ["users", "subscriptions", "api_keys", "api_usage"]) {
        expect((await pool.query("SELECT to_regclass($1) AS name", [`${schema}.${table}`])).rows[0].name).not.toBeNull();
      }
      expect((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE name='005_stripe_subscriptions.sql'")).rows[0].count).toBe(1);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  }, 30_000);
});
