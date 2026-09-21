import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { BidError } from "./domain.js";
export function normalizeLogo(
  buffer: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  return new Promise((done, reject) => {
    const process = execFile(
      globalThis.process.execPath,
      ["--max-old-space-size=96", resolve("scripts/normalize-logo.mjs")],
      { timeout: 5000, maxBuffer: 3 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(
            new BidError(
              "INVALID_ASSET",
              "Use a still PNG, JPEG or WebP, at most 2 MiB and 4 megapixels.",
            ),
          );
          return;
        }
        try {
          const result = JSON.parse(stdout);
          done({
            data: Buffer.from(result.data, "base64"),
            width: result.width,
            height: result.height,
          });
        } catch {
          reject(
            new BidError("INVALID_ASSET", "The image could not be processed."),
          );
        }
      },
    );
    process.stdin?.on("error", () => undefined);
    process.stdin?.end(buffer);
  });
}
