import type { FeedbackResult, ReceiptAnalysis } from "../domain/schemas.js";
import type { GroundingFacts } from "../domain/grounding.js";

export interface ReceiptImageInput {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface AIProvider {
  readonly name: string;
  analyzeReceipt(images: ReceiptImageInput[]): Promise<ReceiptAnalysis>;
  generateFeedback(facts: GroundingFacts): Promise<FeedbackResult>;
}
