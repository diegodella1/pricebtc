import { createBidRuntime } from "./runtime.js";
import { workerTick } from "./worker.js";
import { auditTick } from "./audit-worker.js";
import { exportEvents } from "./analytics-export.js";
const service = createBidRuntime();
if (!service) throw new Error("Worker requires DATABASE_URL");
let stopped = false;
let auditing: Promise<void> | null = null;
let nextAudit = 0;
let exporting: Promise<void> | null = null;
let nextExport = 0;
process.once("SIGTERM", () => {
  stopped = true;
});
process.once("SIGINT", () => {
  stopped = true;
});
while (!stopped) {
  if (!exporting && Date.now() >= nextExport) {
    exporting = exportEvents(service)
      .catch(() => {
        process.stderr.write(
          "Sats Bid analytics delivery delayed; outbox retained\n",
        );
      })
      .finally(() => {
        exporting = null;
        nextExport = Date.now() + 10000;
      });
  }
  if (!auditing && Date.now() >= nextAudit) {
    auditing = auditTick(service)
      .catch(() => {
        process.stderr.write("Sats Bid audit delayed; cursor retained\n");
      })
      .finally(() => {
        auditing = null;
        nextAudit = Date.now() + 60000;
      });
  }
  try {
    await workerTick(service);
  } catch {
    process.stderr.write(
      "Sats Bid verification delayed; pending work retained\n",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
await auditing;
await exporting;
await service.pool.end();
