import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

export function validSignature(body, signature, secret) {
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export class DeploymentQueue {
  constructor(directory, execute) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, "state.json");
    this.execute = execute;
    this.busy = false;
    this.state = existsSync(this.file)
      ? JSON.parse(readFileSync(this.file, "utf8"))
      : { pending: null, running: null, deliveries: [], history: [] };
    // A killed worker may have completed cutover. The runner checks the deployed SHA.
    this.state.pending ??= this.state.running;
    this.state.running = null;
    this.save();
  }

  save() {
    const temporary = `${this.file}.tmp`;
    const descriptor = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify(this.state, null, 2));
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    renameSync(temporary, this.file);
    const directory = openSync(join(this.file, ".."), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }

  enqueue(job) {
    if (this.state.deliveries.includes(job.delivery)) return false;
    const previous = this.state;
    this.state = { ...previous, deliveries: [...previous.deliveries.slice(-999), job.delivery], pending: job };
    try { this.save(); } catch (error) { this.state = previous; throw error; }
    return true;
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.state.pending) {
        const job = this.state.pending;
        this.state.pending = null;
        this.state.running = job;
        this.save();
        let result;
        try { result = await this.execute(job); }
        catch (error) { result = { status: "failed", error: String(error) }; }
        this.state.history = [...this.state.history.slice(-99), { ...job, ...result, finishedAt: new Date().toISOString() }];
        this.state.running = null;
        this.save();
      }
    } finally { this.busy = false; }
  }
}

export function webhookServer({ secret, queue, repository = "diegodella1/pricebtc" }) {
  return createServer(async (request, response) => {
    const reply = (status, message) => {
      response.writeHead(status, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      response.end(message);
    };
    if (request.method !== "POST" || request.url !== "/hooks/github-deploy") return reply(404, "Not found");
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) return reply(413, "Payload too large");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!validSignature(body, request.headers["x-hub-signature-256"], secret)) return reply(401, "Invalid signature");
      let payload;
      try { payload = JSON.parse(body); } catch { return reply(400, "Invalid JSON"); }
      if (payload?.repository?.full_name !== repository) return reply(403, "Wrong repository");
      const event = request.headers["x-github-event"];
      if (event === "ping") return reply(200, "pong");
      if (event !== "push" || payload.ref !== "refs/heads/main" || payload.deleted) return reply(200, "Ignored");
      const delivery = request.headers["x-github-delivery"];
      if (typeof delivery !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(delivery) || !/^[a-f0-9]{40}$/.test(payload.after)) {
        return reply(400, "Invalid delivery or revision");
      }
      const accepted = queue.enqueue({ delivery, sha: payload.after, receivedAt: new Date().toISOString() });
      reply(accepted ? 202 : 200, accepted ? "Queued" : "Duplicate");
      queue.drain().catch(error => { console.error(error); process.exit(1); });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) reply(500, "Unable to persist delivery");
    }
  });
}

function runJob(directory, job) {
  return new Promise((resolve, reject) => {
    const log = join(directory, `${job.delivery}.log`);
    const output = openSync(log, "a", 0o600);
    const environment = { ...process.env };
    delete environment.PRICEBTC_WEBHOOK_SECRET;
    const child = spawn("/bin/bash", ["/usr/local/lib/pricebtc-deploy/auto-deploy.sh", job.sha], {
      env: environment, stdio: ["ignore", output, output],
    });
    closeSync(output);
    console.log(`Deployment started: ${job.sha}; log=${log}`);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const status = code === 0 ? "succeeded" : "failed";
      console.log(`Deployment ${status}: ${job.sha}; code=${code}; signal=${signal}`);
      resolve({ status, code, signal, log });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.PRICEBTC_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) throw new Error("A webhook secret of at least 32 characters is required");
  const directory = process.env.PRICEBTC_DEPLOY_STATE ?? "/var/lib/pricebtc-deploy";
  const queue = new DeploymentQueue(directory, job => runJob(directory, job));
  const server = webhookServer({ secret, queue });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(3472, "127.0.0.1", () => console.log("Deploy webhook listening on 127.0.0.1:3472"));
  queue.drain().catch(error => { console.error(error); process.exit(1); });
}
