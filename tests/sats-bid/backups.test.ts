import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("rotates only completed Sats Bid backups and retains daily/weekly recovery points", async () => {
  const root = await mkdtemp(join(tmpdir(), "pricebtc-backup-test-"));
  try {
    for (let index = 0; index < 40; index++) {
      const name =
        new Date(Date.UTC(2026, 0, 1 + index))
          .toISOString()
          .slice(0, 10)
          .replaceAll("-", "") + "T031500Z";
      await mkdir(join(root, name));
      await writeFile(
        join(root, name, "manifest.json"),
        JSON.stringify({ application: "pricebtc-sats-bid", complete: true }),
      );
    }
    await mkdir(join(root, "20200101T000000Z"));
    await mkdir(join(root, "unrelated-backup"));
    execFileSync(process.execPath, ["scripts/rotate-sats-backups.mjs", root]);
    const retained = await readdir(root);
    expect(retained).toContain("20200101T000000Z");
    expect(retained).toContain("unrelated-backup");
    expect(retained).not.toContain("20260101T031500Z");
    expect(retained).toContain("20260209T031500Z");
    expect(retained.length).toBeGreaterThanOrEqual(9);
    expect(retained.length).toBeLessThanOrEqual(13);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
