import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeLogo } from "../../src/server/sats-bid/logo.js";
describe("Logo processing", () => {
  it("reencodes and bounds an image instead of serving its original", async () => {
    const original = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "orange" },
    })
      .png()
      .toBuffer();
    const result = await normalizeLogo(original);
    expect(result.width).toBe(512);
    expect(result.height).toBe(384);
    expect((await sharp(result.data).metadata()).format).toBe("webp");
  });
  it("rejects SVG disguised as an image", async () => {
    await expect(
      normalizeLogo(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ASSET" });
  });
  it("rejects excessive dimensions before reencoding", async () => {
    const image = await sharp({
      create: { width: 2100, height: 2100, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(normalizeLogo(image)).rejects.toMatchObject({
      code: "INVALID_ASSET",
    });
  });
});
