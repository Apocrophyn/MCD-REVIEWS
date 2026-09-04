import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { GroundingFacts } from "../domain/grounding.js";
import type { FeedbackResult, ReceiptAnalysis } from "../domain/schemas.js";
import type { AIProvider, ReceiptImageInput } from "./provider.js";

/** Deterministic provider used only when NODE_ENV=test. */
export class TestAIProvider implements AIProvider {
  readonly name = "Test AI";

  async analyzeReceipt(images: ReceiptImageInput[]): Promise<ReceiptAnalysis> {
    const image = sharp(images[0].buffer);
    const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    const means = stats.channels.slice(0, 3).map((channel) => channel.mean);
    const colorSpread = Math.max(...means) - Math.min(...means);
    const contrast = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
    const isReceipt = (metadata.height ?? 0) >= (metadata.width ?? 1) * 1.25 && colorSpread < 12 && contrast > 20;
    if (!isReceipt) {
      return {
        classification: { isReceipt: false, confidence: 0.98, reason: "The image does not contain receipt-like document structure.", evidence: [] },
        extraction: null,
      };
    }
    return {
      classification: { isReceipt: true, confidence: 0.96, reason: "A printed merchant document with line items and totals is visible.", evidence: ["merchant heading", "line items", "transaction total"] },
      extraction: {
        store: "High Street Restaurant",
        visitedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
        orderNumber: "87321",
        surveyCode: "1234-5678-9012",
        currency: "GBP",
        subtotal: 8.33,
        tax: 1.67,
        total: 10,
        confidence: 0.93,
        items: [
          { id: randomUUID(), quantity: 1, name: "Big Mac Meal", normalizedName: "Big Mac Meal", price: 7.49, confidence: 0.96 },
          { id: randomUUID(), quantity: 1, name: "Apple Pie", normalizedName: "Apple Pie", price: 2.51, confidence: 0.9 },
        ],
      },
    };
  }

  async generateFeedback(facts: GroundingFacts): Promise<FeedbackResult> {
    const claims: FeedbackResult["claims"] = [{ text: `I rated my visit to ${facts.store} ${facts.satisfaction} out of 5.`, factKeys: ["store", "satisfaction"] }];
    if (facts.employeeName) claims.push({ text: `${facts.employeeName} was the team member I selected.`, factKeys: ["employee"] });
    if (facts.notes) claims.push({ text: facts.notes, factKeys: ["notes"] });
    return { claims };
  }
}
