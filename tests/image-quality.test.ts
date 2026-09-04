import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectImage } from "../server/image-quality.js";

async function checkerboard(width: number, height: number) {
  const data = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const value = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 ? 235 : 25;
    data[index * 3] = value;
    data[index * 3 + 1] = value;
    data[index * 3 + 2] = value;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("image quality", () => {
  it("accepts a decodable, high-contrast portrait image", async () => {
    const result = await inspectImage(await checkerboard(800, 1200));
    expect(result.mimeType).toBe("image/png");
    expect(result.quality).toMatchObject({ readable: true, fullReceipt: true, noGlare: true });
  });

  it("rejects content that merely claims to be an image", async () => {
    await expect(inspectImage(Buffer.from("not an image"))).rejects.toThrow("decoded");
  });
});
