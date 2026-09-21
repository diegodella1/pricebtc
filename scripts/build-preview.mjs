import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(process.env.PRICEBTC_PREVIEW_DIR ?? ".data/sats-preview");
for (const args of [
  ["node_modules/vite/bin/vite.js", "build", "--outDir", `${root}/client`],
  ["scripts/prepare-static.mjs", `${root}/client`],
  [
    "node_modules/tsup/dist/cli-default.js",
    "src/server/index.ts",
    "src/server/sats-bid/worker-entry.ts",
    "--format",
    "esm",
    "--platform",
    "node",
    "--target",
    "node22",
    "--out-dir",
    `${root}/server`,
    "--sourcemap",
    "--clean",
  ],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
process.stdout.write(`Preview build: ${root}\n`);
