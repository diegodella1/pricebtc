import { execFileSync } from "node:child_process";

const repo = "repos/diegodella1/pricebtc/hooks";
const url = "https://priceb.tc/hooks/github-deploy";
const environment = execFileSync("sudo", ["-n", "cat", "/etc/pricebtc/deploy.env"], { encoding: "utf8" });
const secret = environment.match(/^PRICEBTC_WEBHOOK_SECRET=(.+)$/m)?.[1];
if (!secret) throw new Error("Missing webhook secret");
const hooks = JSON.parse(execFileSync("gh", ["api", repo, "--paginate"], { encoding: "utf8" }));
const existing = hooks.find(hook => hook.config.url === url);
const payload = {
  name: "web", active: true, events: ["push"],
  config: { url, content_type: "json", secret, insecure_ssl: "0" },
};
const hook = JSON.parse(execFileSync("gh", ["api", existing ? `${repo}/${existing.id}` : repo, "--method", existing ? "PATCH" : "POST", "--input", "-"], {
  input: JSON.stringify(payload), encoding: "utf8",
}));
console.log(JSON.stringify({ id: hook.id, active: hook.active, events: hook.events, url: hook.config.url }));
