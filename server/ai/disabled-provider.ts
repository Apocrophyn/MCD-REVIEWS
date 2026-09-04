import type { GroundingFacts } from "../domain/grounding.js";
import type { FeedbackResult, ReceiptAnalysis } from "../domain/schemas.js";
import type { AIProvider, ReceiptImageInput } from "./provider.js";

export class DisabledAIProvider implements AIProvider {
  readonly name = "AI not configured";

  async analyzeReceipt(_images: ReceiptImageInput[]): Promise<ReceiptAnalysis> {
    throw new Error("Real receipt recognition is disabled until ANTHROPIC_API_KEY is configured. No sample data was substituted.");
  }

  async generateFeedback(_facts: GroundingFacts): Promise<FeedbackResult> {
    throw new Error("Real feedback generation is disabled until ANTHROPIC_API_KEY is configured. No hardcoded description was returned.");
  }
}
