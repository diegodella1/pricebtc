import sharp from "sharp";
sharp.concurrency(1);
sharp.cache(false);
const chunks = [];
let length = 0;
for await (const chunk of process.stdin) {
  length += chunk.length;
  if (length > 2 * 1024 * 1024) throw new Error("Image exceeds 2 MiB");
  chunks.push(chunk);
}
const source = Buffer.concat(chunks);
const png = source
  .subarray(0, 8)
  .equals(Buffer.from("89504e470d0a1a0a", "hex"));
const jpeg = source.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
const webp =
  source.toString("ascii", 0, 4) === "RIFF" &&
  source.toString("ascii", 8, 12) === "WEBP";
if (!png && !jpeg && !webp) throw new Error("Unsupported image signature");
if (png)
  for (let offset = 8; offset + 12 <= source.length;) {
    const size = source.readUInt32BE(offset);
    const type = source.toString("ascii", offset + 4, offset + 8);
    if (["acTL", "fcTL", "fdAT"].includes(type))
      throw new Error("Animated PNG is not supported");
    if (offset + size + 12 > source.length)
      throw new Error("Invalid PNG chunk");
    offset += size + 12;
  }
const decoder = sharp(source, {
  limitInputPixels: 4000000,
  animated: true,
}).timeout({ seconds: 4 });
const metadata = await decoder.metadata();
if (
  !["png", "jpeg", "webp"].includes(metadata.format) ||
  (metadata.pages ?? 1) > 1
)
  throw new Error("Unsupported image");
const result = await decoder
  .rotate()
  .resize(512, 512, { fit: "inside", withoutEnlargement: true })
  .webp()
  .toBuffer({ resolveWithObject: true });
process.stdout.write(
  JSON.stringify({
    data: result.data.toString("base64"),
    width: result.info.width,
    height: result.info.height,
  }),
);
