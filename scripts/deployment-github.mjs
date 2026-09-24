import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const repository = "diegodella1/pricebtc";
export const context = "pricebtc/production";

function api(path, payload) {
  const args = ["api", `repos/${repository}/${path}`];
  if (payload) args.push("--method", "POST", "--input", "-");
  return JSON.parse(execFileSync("gh", args, {
    encoding: "utf8", timeout: 30_000,
    input: payload ? JSON.stringify(payload) : undefined,
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

export function ciResult(runs, sha) {
  const run = runs.filter(run => run.head_sha === sha && run.head_branch === "main" &&
    ["push", "workflow_dispatch"].includes(run.event) && run.head_repository?.full_name === repository)
    .sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== "completed") return "pending";
  return run.conclusion === "success" ? "success" : "failure";
}

export async function waitForCI(sha, { request = api, sleep = delay, now = Date.now, timeout = 20 * 60_000 } = {}) {
  const deadline = now() + timeout;
  console.log(`Waiting for CI on ${sha}`);
  while (now() < deadline) {
    const data = request(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`);
    const result = ciResult(data.workflow_runs, sha);
    if (result === "success") { console.log("CI passed"); return; }
    if (result === "failure") throw new Error(`CI did not pass for ${sha}; inspect GitHub Actions`);
    await sleep(15_000);
  }
  throw new Error(`Timed out waiting for CI on ${sha}; production unchanged`);
}

export function publicationProblem(statuses, now = Date.now()) {
  const status = statuses.find(status => status.context === context);
  if (!status) return "No production status recorded for main";
  if (status.state === "success") return null;
  if (status.state === "pending" && now - Date.parse(status.updated_at) < 30 * 60_000) return null;
  return `Production ${status.state}: ${status.description}`;
}

async function main() {
  const [command, sha, state, description] = process.argv.slice(2);
  if (command === "monitor") {
    const { statuses } = api("commits/main/status");
    const problem = publicationProblem(statuses);
    if (problem) throw new Error(problem);
    const response = await fetch("https://priceb.tc/healthz", { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Public health: HTTP ${response.status}`);
    const health = await response.json();
    if (health.status !== "ok" || health.market?.state !== "live") throw new Error("Public market health is not live");
    console.log("Publication status and public health OK");
    return;
  }
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Expected a full revision");
  if (command === "wait") return waitForCI(sha);
  if (command === "status" && ["pending", "success", "failure", "error"].includes(state)) {
    api(`statuses/${sha}`, {
      state, context, description: (description ?? "").slice(0, 140),
      target_url: state === "success" ? "https://priceb.tc" : `https://github.com/${repository}/actions`,
    });
    console.log(`Production status: ${state} (${sha})`);
    return;
  }
  throw new Error("Expected wait SHA, status SHA STATE DESCRIPTION, or monitor");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
