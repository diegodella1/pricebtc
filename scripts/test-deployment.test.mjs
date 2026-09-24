import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeploymentQueue, validSignature, webhookServer } from "./deploy-webhook.mjs";
import { verifyRelease } from "./verify-release.mjs";
import { ciResult, waitForCI, publicationProblem, context } from "./deployment-github.mjs";

const secret = "test-secret-with-at-least-32-characters";
const sha = "a".repeat(40);
const signature = body => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const successfulRun = { id: 1, head_sha: sha, head_branch: "main", event: "push", head_repository: { full_name: "diegodella1/pricebtc" }, status: "completed", conclusion: "success" };

test("CI gate requires the exact revision, main branch, and trusted event/repository", () => {
  assert.equal(ciResult([successfulRun], sha), "success");
  for (const patch of [{ head_sha: "b".repeat(40) }, { head_branch: "feature" }, { event: "pull_request" }, { head_repository: { full_name: "other/repo" } }]) {
    assert.equal(ciResult([{ ...successfulRun, ...patch }], sha), "pending");
  }
  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out", null]) {
    assert.equal(ciResult([{ ...successfulRun, conclusion }], sha), "failure");
  }
  assert.equal(ciResult([successfulRun, { ...successfulRun, id: 2, status: "in_progress" }], sha), "pending");
});

test("CI gate waits for completion and fails closed on failure, timeout or API errors", async () => {
  let attempts = 0;
  await waitForCI(sha, {
    request: () => ({ workflow_runs: ++attempts === 1 ? [] : [successfulRun] }), sleep: async () => {},
  });
  assert.equal(attempts, 2);
  await assert.rejects(waitForCI(sha, {
    request: () => ({ workflow_runs: [{ ...successfulRun, conclusion: "failure" }] }),
  }), /CI did not pass/);
  let clock = 0;
  await assert.rejects(waitForCI(sha, {
    request: () => ({ workflow_runs: [] }), now: () => clock, timeout: 1,
    sleep: async () => { clock = 2; },
  }), /Timed out/);
  await assert.rejects(waitForCI(sha, { request: () => { throw new Error("API unavailable"); } }), /API unavailable/);
});

test("monitor detects missing, failed and stuck publications while allowing a running deployment", () => {
  const now = Date.now();
  const status = { context, state: "pending", updated_at: new Date(now).toISOString(), description: "Building" };
  assert.match(publicationProblem([]), /No production status/);
  assert.equal(publicationProblem([status], now), null);
  assert.match(publicationProblem([status], now + 31 * 60_000), /pending/);
  assert.match(publicationProblem([{ ...status, state: "failure" }], now), /failure/);
  assert.equal(publicationProblem([{ ...status, state: "success" }], now), null);
});

test("rejects modified payloads and malformed signatures", () => {
  const body = Buffer.from("original");
  assert.ok(validSignature(body, signature(body), secret));
  assert.equal(validSignature(Buffer.from("modified"), signature(body), secret), false);
  for (const invalid of [undefined, "sha256=", "sha1=abc", [signature(body)]]) assert.equal(validSignature(body, invalid, secret), false);
});

test("persists jobs before acknowledgement and filters unsafe events", async t => {
  const directory = mkdtempSync(join(tmpdir(), "pricebtc-webhook-"));
  const queue = new DeploymentQueue(directory, async () => ({ status: "succeeded" }));
  // Keep queued jobs on disk so acknowledgements can be inspected before execution.
  queue.busy = true;
  const server = webhookServer({ secret, queue });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.close(); server.closeAllConnections(); rmSync(directory, { recursive: true, force: true }); });
  const send = async (patch = {}, headers = {}) => {
    const body = JSON.stringify({ repository: { full_name: "diegodella1/pricebtc" }, ref: "refs/heads/main", after: sha, ...patch });
    return fetch(`http://127.0.0.1:${server.address().port}/hooks/github-deploy`, {
      method: "POST", body,
      headers: { "x-hub-signature-256": signature(body), "x-github-event": "push", "x-github-delivery": "delivery-1", ...headers },
    });
  };
  assert.equal((await send({}, { "x-hub-signature-256": "bad" })).status, 401);
  assert.equal((await send({ repository: { full_name: "other/repo" } })).status, 403);
  assert.equal((await send({ ref: "refs/heads/feature" })).status, 200);
  assert.equal((await send({ deleted: true })).status, 200);
  assert.equal((await send({ after: "$(touch /tmp/unsafe)" })).status, 400);
  assert.equal(queue.state.pending, null);
  assert.equal((await send()).status, 202);
  assert.equal(JSON.parse(readFileSync(queue.file)).pending.sha, sha);
  assert.equal((await send()).status, 200);
  assert.equal(queue.state.deliveries.length, 1);
});

test("coalesces pushes, serializes work, and continues after failure", async t => {
  const directory = mkdtempSync(join(tmpdir(), "pricebtc-queue-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executions = [];
  let finishFirst;
  const queue = new DeploymentQueue(directory, async job => {
    executions.push(job.delivery);
    if (job.delivery === "first") await new Promise(resolve => { finishFirst = resolve; });
    return { status: job.delivery === "first" ? "failed" : "succeeded" };
  });
  queue.enqueue({ delivery: "first", sha });
  const running = queue.drain();
  queue.enqueue({ delivery: "second", sha });
  queue.enqueue({ delivery: "third", sha });
  await queue.drain();
  assert.deepEqual(executions, ["first"]);
  finishFirst();
  await running;
  assert.deepEqual(executions, ["first", "third"]);
  assert.deepEqual(queue.state.history.map(job => job.status), ["failed", "succeeded"]);
});

test("recovers interrupted work and preserves the newest pending push", async t => {
  const directory = mkdtempSync(join(tmpdir(), "pricebtc-restart-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const queue = new DeploymentQueue(directory, async () => ({}));
  queue.state.running = { delivery: "interrupted", sha };
  queue.save();
  const recovered = new DeploymentQueue(directory, async () => ({ status: "succeeded" }));
  assert.equal(recovered.state.pending.delivery, "interrupted");
  recovered.state.running = recovered.state.pending;
  recovered.enqueue({ delivery: "newer", sha });
  const restarted = new DeploymentQueue(directory, async () => ({ status: "succeeded" }));
  assert.equal(restarted.state.pending.delivery, "newer");
  await restarted.drain();
  assert.equal(restarted.state.history[0].status, "succeeded");
});

function releaseFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pricebtc-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scripts = join(root, "scripts");
  const bin = join(root, "mock-bin");
  const old = join(root, ".data/releases/old");
  for (const path of [scripts, bin, old]) mkdirSync(path, { recursive: true });
  const source = readFileSync(new URL("./deploy_release.sh", import.meta.url), "utf8");
  writeFileSync(join(scripts, "deploy_release.sh"), source.replace(
    'export PATH="/home/diego/.local/bin:/usr/local/bin:/usr/bin:/bin"',
    'export PATH="$PRICEBTC_TEST_BIN:/usr/bin:/bin"',
  ));
  writeFileSync(join(root, ".gitignore"), ".data/\ndist\n");
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  const executable = (name, body) => writeFileSync(join(bin, name), `#!/bin/bash\nset -e\n${body}\n`, { mode: 0o755 });
  executable("rtk", `
    if [ "$2" = ci ]; then mkdir -p node_modules; fi
    if [ "\${3:-}" = lint ] && [ "\${FAIL_BUILD:-}" = yes ]; then exit 1; fi
    if [ "\${3:-}" = build:preview ]; then
      mkdir -p "$PRICEBTC_PREVIEW_DIR/client" "$PRICEBTC_PREVIEW_DIR/server"
      echo built > "$PRICEBTC_PREVIEW_DIR/client/index.html"
    fi`);
  executable("sudo", 'shift; "$@"');
  executable("systemctl", `
    echo "$*" >> "$PRICEBTC_TEST_ROOT/.data/systemctl.log"
    if [ "$1" = is-active ]; then exit 1; fi`);
  executable("node", `
    if [[ "$1" = *check-release-startup.mjs ]] && [ "\${FAIL_STARTUP:-}" = yes ]; then exit 1; fi
    if [[ "$1" = *verify-release.mjs ]] && [ "\${FAIL_HEALTH:-}" = yes ] && [ "$(readlink -f "$3")" != "$PRICEBTC_TEST_ROOT/.data/releases/old" ]; then exit 1; fi`);
  executable("sleep", ":");
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture");
  symlinkSync(old, join(root, "dist"));
  const run = extra => spawnSync("bash", [join(scripts, "deploy_release.sh")], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PRICEBTC_TEST_BIN: bin, PRICEBTC_TEST_ROOT: root, PRICEBTC_AUTO_DEPLOY: "true", ...extra },
  });
  return { root, old, run, git };
}

test("a failed build never stops production or replaces its release", t => {
  const fixture = releaseFixture(t);
  const result = fixture.run({ FAIL_BUILD: "yes" });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(readlinkSync(join(fixture.root, "dist")), fixture.old);
  assert.equal(existsSync(join(fixture.root, ".data/systemctl.log")), false);
});

test("automatic runner stops on failed CI and migrations, and reports verified success", t => {
  const fixture = releaseFixture(t);
  const { root, git } = fixture;
  const script = readFileSync(new URL("./auto-deploy.sh", import.meta.url), "utf8")
    .replace('export PATH="/home/diego/.local/bin:/usr/local/bin:/usr/bin:/bin"', 'export PATH="$PRICEBTC_TEST_BIN:/usr/bin:/bin"')
    .replace("cd /home/diego/Documents/pricebtc", 'cd "$PRICEBTC_TEST_ROOT"');
  writeFileSync(join(root, "scripts/auto-deploy.sh"), script);
  writeFileSync(join(root, "scripts/deploy_release.sh"), 'echo deployed >> .data/activated\n');
  writeFileSync(join(root, "mock-bin/node"), `#!/bin/bash
    echo "$*" >> "$PRICEBTC_TEST_ROOT/.data/github.log"
    if [ "$2" = wait ] && [ "\${FAIL_CI:-}" = yes ]; then exit 1; fi
  `, { mode: 0o755 });
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "automatic runner fixture");
  const previous = git("rev-parse", "HEAD").toString().trim();
  writeFileSync(join(fixture.old, "REVISION"), previous);
  mkdirSync(join(root, "migrations"));
  writeFileSync(join(root, "migrations/005.sql"), "SELECT 1;\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "schema change");
  const target = git("rev-parse", "HEAD").toString().trim();
  git("remote", "add", "origin", root);
  const run = extra => spawnSync("bash", [join(root, "scripts/auto-deploy.sh"), target], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PRICEBTC_TEST_BIN: join(root, "mock-bin"), PRICEBTC_TEST_ROOT: root, ...extra },
  });
  let result = run({ FAIL_CI: "yes" });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(existsSync(join(root, ".data/activated")), false);
  assert.match(readFileSync(join(root, ".data/github.log"), "utf8"), /status .* failure CI failed/);
  result = run({});
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Migration changes require a manual deployment/);
  assert.equal(existsSync(join(root, ".data/activated")), false);
  // A completed manual release advances the baseline; normal automatic builds resume.
  writeFileSync(join(fixture.old, "REVISION"), target);
  result = run({});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, ".data/activated"), "utf8").trim(), "deployed");
  assert.match(readFileSync(join(root, ".data/github.log"), "utf8"), /status .* success Published/);
});

test("a candidate startup failure leaves production untouched", t => {
  const fixture = releaseFixture(t);
  const result = fixture.run({ FAIL_STARTUP: "yes" });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(readlinkSync(join(fixture.root, "dist")), fixture.old);
  assert.equal(existsSync(join(fixture.root, ".data/systemctl.log")), false);
});

test("a failed post-cutover health check restores and verifies the previous release", t => {
  const fixture = releaseFixture(t);
  const result = fixture.run({ FAIL_HEALTH: "yes" });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(readlinkSync(join(fixture.root, "dist")), fixture.old);
  assert.match(result.stdout, /Previous release restored and verified/);
  assert.equal(existsSync(join(fixture.root, ".data/deployment-transaction")), false);
});

test("a successful deployment records the exact verified revision", t => {
  const fixture = releaseFixture(t);
  const result = fixture.run({});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(fixture.root, "dist/REVISION"), "utf8").trim(), fixture.git("rev-parse", "HEAD").toString().trim());
  assert.ok(existsSync(join(fixture.root, "dist/VERIFIED")));
  assert.equal(existsSync(join(fixture.root, ".data/deployment-transaction")), false);
});

test("an interrupted activation is rolled back before another build", t => {
  const fixture = releaseFixture(t);
  const backup = join(fixture.root, ".data/deployment-backups/interrupted");
  mkdirSync(backup, { recursive: true });
  symlinkSync(fixture.old, join(backup, "dist"));
  rmSync(join(fixture.root, "dist"));
  symlinkSync(join(fixture.root, ".data/releases/broken"), join(fixture.root, "dist"));
  writeFileSync(join(fixture.root, ".data/deployment-transaction"), backup);
  const result = fixture.run({ FAIL_BUILD: "yes" });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(readlinkSync(join(fixture.root, "dist")), fixture.old);
  assert.match(result.stdout, /Previous release restored and verified/);
});

test("public verification rejects old assets and stale market data", async t => {
  const directory = mkdtempSync(join(tmpdir(), "pricebtc-verify-"));
  mkdirSync(join(directory, "client/assets"), { recursive: true });
  const html = '<script src="/assets/index-current.js"></script>';
  writeFileSync(join(directory, "client/index.html"), html);
  writeFileSync(join(directory, "client/assets/index-current.js"), "current-build");
  let staleAsset = false;
  let staleMarket = false;
  let missingPage = false;
  let missingHeaders = false;
  const server = createServer((request, response) => {
    if (request.url === "/healthz") return response.end(JSON.stringify({ market: { state: "live", lastUpdateAt: new Date(Date.now() - (staleMarket ? 60_000 : 0)).toISOString() }, fx: { state: "live" } }));
    if (request.url === "/terms" && missingPage) { response.statusCode = 404; return response.end("Missing page"); }
    if (request.url.startsWith("/api/")) {
      if (!missingHeaders) {
        response.setHeader("x-ratelimit-limit", "120");
        response.setHeader("x-ratelimit-remaining", "119");
        response.setHeader("x-ratelimit-reset", "60");
      }
      return response.end("{}");
    }
    if (request.url.startsWith("/assets/")) return response.end(staleAsset ? "old-build" : "current-build");
    response.end(html);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.close(); server.closeAllConnections(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  await verifyRelease(base, directory);
  staleAsset = true;
  await assert.rejects(verifyRelease(base, directory), /Asset content differs/);
  staleAsset = false;
  staleMarket = true;
  await assert.rejects(verifyRelease(base, directory), /Market data is stale/);
  staleMarket = false;
  missingPage = true;
  await assert.rejects(verifyRelease(base, directory), /\/terms: HTTP 404/);
  missingPage = false;
  missingHeaders = true;
  await assert.rejects(verifyRelease(base, directory), /missing or invalid x-ratelimit-limit/);
  // Older releases must still be recoverable despite lacking the new functionality.
  await verifyRelease(base, directory, { legacy: true });
});
