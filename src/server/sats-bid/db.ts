import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
export type Sql = Pick<pg.PoolClient, "query">;
export function database(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
  });
  pool.on("error", () => {
    process.stderr.write(
      "Sats Bid database connection lost; reconnecting on demand\n",
    );
  });
  return pool;
}
export async function transaction<T>(
  pool: pg.Pool,
  operation: (sql: Sql) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(
      readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function migrate(pool: pg.Pool) {
  await transaction(pool, async (sql) => {
    await sql.query("SELECT pg_advisory_xact_lock(9376201)");
    await sql.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await sql.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await sql.query(await readFile(join("migrations", name), "utf8"));
      await sql.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
  });
}
