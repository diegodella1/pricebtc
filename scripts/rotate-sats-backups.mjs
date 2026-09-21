import { readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
const root = resolve(process.argv[2]);
const candidates = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^\d{8}T\d{6}Z$/.test(entry.name)) continue;
  try {
    const manifest = JSON.parse(await readFile(join(root, entry.name, "manifest.json"), "utf8"));
    if (manifest.application === "pricebtc-sats-bid" && manifest.complete === true) candidates.push(entry.name);
  } catch { /* Incomplete or unrelated backups are never removed automatically. */ }
}
const keep = new Set(); const days = new Set(); const weeks = new Set();
for (const name of candidates.sort().reverse()) {
  const day = name.slice(0, 8);
  const timestamp = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
  const week = Math.floor((timestamp + 3 * 86400000) / (7 * 86400000));
  if (!days.has(day) && days.size < 7) { keep.add(name); days.add(day); }
  if (!weeks.has(week) && weeks.size < 4) { keep.add(name); weeks.add(week); }
}
for (const name of candidates) if (!keep.has(name)) await rm(join(root, name), { recursive: true });
