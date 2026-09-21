import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { verifyRelease } from "./verify-release.mjs";

const release = resolve(process.argv[2]);
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", resolve);
});
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const dataDirectory = await mkdtemp(join(tmpdir(), "pricebtc-preflight-"));
const environment = {
  ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port),
  PRICEBTC_FRONTEND_DIR: join(release, "client"), PRICEBTC_DATA_DIR: dataDirectory,
  DATABASE_URL: "", SATS_WORKER_ENABLED: "false",
};
delete environment.PRICEBTC_WEBHOOK_SECRET;
const child = spawn(process.execPath, [join(release, "server/index.js")], {
  env: environment, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let exited = false;
const finished = new Promise(resolve => {
  child.once("error", error => { output += String(error); });
  child.once("close", () => { exited = true; resolve(); });
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", chunk => { output = (output + chunk).slice(-8000); });
}
try {
  let ready = false;
  let failure;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (exited) throw new Error(`Candidate exited before readiness:\n${output}`);
    try { await verifyRelease(`http://127.0.0.1:${port}`, release); ready = true; break; }
    catch (error) { failure = error; await delay(2000); }
  }
  if (!ready) throw new Error(`Candidate not ready: ${failure}\n${output}`);
  console.log("Candidate startup and release checks passed before cutover");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (!exited) child.kill("SIGTERM");
  const forceStop = setTimeout(() => { if (!exited) child.kill("SIGKILL"); }, 10_000);
  await finished;
  clearTimeout(forceStop);
  await rm(dataDirectory, { recursive: true, force: true });
}
