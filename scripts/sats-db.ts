import { database, migrate } from "../src/server/sats-bid/db.js";
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL before running migrations");
const pool = database(process.env.DATABASE_URL);
try {
  await migrate(pool);
  process.stdout.write("Sats Bid migrations applied\n");
} finally {
  await pool.end();
}
