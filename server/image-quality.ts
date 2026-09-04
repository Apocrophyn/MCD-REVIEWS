import sharp from "sharp";
import type { QualityAssessment } from "./domain/schemas.js";

const allowedFormats = new Map<string, string>([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

export interface InspectedImage {
  format: string;
  mimeType: string;
  quality: QualityAssessment;
}

export class ImageValidationError extends Error {}

export async function inspectImage(buffer: Buffer): Promise<InspectedImage> {
  let image;
  try {
    image = sharp(buffer, { failOn: "error", limitInputPixels: 40_000_000 });
  } catch {
    throw new ImageValidationError("The file is not a supported image");
  }

  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]).catch(() => {
    throw new ImageValidationError("The image could not be decoded");
  });
  const format = metadata.format ?? "";
  const mimeType = allowedFormats.get(format);
  if (!mimeType) throw new ImageValidationError("Use a JPEG, PNG, or WebP image");
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new ImageValidationError("The image has invalid dimensions");

  const channelMeans: number[] = stats.channels.slice(0, 3).map((channel: { mean: number }) => channel.mean);
  const brightness = channelMeans.reduce((sum: number, value: number) => sum + value, 0) / channelMeans.length;
  const contrast = stats.channels.slice(0, 3).reduce((sum: number, channel: { stdev: number }) => sum + channel.stdev, 0) / Math.min(3, stats.channels.length);
  const readable = Math.min(width, height) >= 700 && contrast >= 18;
  const noGlare = brightness < 242;
  const fullReceipt = height >= width * 1.15 || width >= height * 1.15;
  const failures = [!readable && "The image is too small or low-contrast", !fullReceipt && "Make sure the full receipt is visible", !noGlare && "Reduce glare on the paper"].filter(Boolean);

  return {
    format,
    mimeType,
    quality: {
      readable,
      fullReceipt,
      noGlare,
      width,
      height,
      brightness: Math.round(brightness),
      message: failures.length ? failures.join(". ") : "The image looks ready to analyse",
    },
  };
}
