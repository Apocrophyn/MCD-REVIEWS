import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { feedbackResultSchema, receiptAnalysisSchema } from "../domain/schemas.js";
import { normalizeItemName } from "../domain/normalize.js";
import type { GroundingFacts } from "../domain/grounding.js";
import type { AIProvider, ReceiptImageInput } from "./provider.js";

const receiptTool = {
  name: "classify_and_record_receipt",
  description: "First decide whether the supplied images show a real transaction receipt. Only record receipt fields when receipt-specific evidence is visible.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["isReceipt", "classificationConfidence", "rejectionReason", "receiptEvidence", "receipt"],
    properties: {
      isReceipt: { type: "boolean", description: "True only when at least two independent receipt signals are visible, such as a merchant, line items, transaction date/order number, subtotal/tax/total, payment line, or survey invitation." },
      classificationConfidence: { type: "number", minimum: 0, maximum: 1 },
      rejectionReason: { type: "string", description: "Plain-language reason when isReceipt is false; short confirmation when true." },
      receiptEvidence: { type: "array", maxItems: 8, items: { type: "string" } },
      receipt: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["store", "visitedAt", "orderNumber", "surveyCode", "currency", "subtotal", "tax", "total", "confidence", "items"],
        properties: {
          store: { type: "string" },
          visitedAt: { type: ["string", "null"], description: "ISO 8601 date/time when legible" },
          orderNumber: { type: "string" },
          surveyCode: { type: "string" },
          currency: { type: "string", minLength: 3, maxLength: 3 },
          subtotal: { type: ["number", "null"], minimum: 0 },
          tax: { type: ["number", "null"], minimum: 0 },
          total: { type: ["number", "null"], minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          items: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quantity", "name", "price", "confidence"],
              properties: {
                quantity: { type: "integer", minimum: 1 },
                name: { type: "string" },
                price: { type: "number", minimum: 0 },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },
  },
};

const feedbackTool = {
  name: "record_feedback_claims",
  description: "Return a short natural feedback draft split into claims. Every claim must cite one or more supplied fact keys and may not introduce unsupported details.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["claims"],
    properties: {
      claims: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "factKeys"],
          properties: {
            text: { type: "string", maxLength: 240 },
            factKeys: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
          },
        },
      },
    },
  },
};

export class AnthropicProvider implements AIProvider {
  readonly name = "Claude";
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeReceipt(images: ReceiptImageInput[]) {
    const content: Anthropic.MessageCreateParams["messages"][number]["content"] = [
      ...images.map((image) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: image.mimeType, data: image.buffer.toString("base64") },
      })),
      {
        type: "text" as const,
        text: "Classify before extracting. A photograph, screenshot, menu, document, or object is not a receipt merely because it contains text or prices. Require at least two independent transaction-receipt signals. If uncertain, set isReceipt=false and receipt=null. Merge multiple images only when they clearly show the same receipt. Preserve printed item names and never infer unseen values.",
      },
    ];
    const response = await withTransientRetry(() => this.client.messages.create({
      model: this.model,
      max_tokens: 2_048,
      messages: [{ role: "user", content }],
      tools: [receiptTool],
      tool_choice: { type: "tool", name: receiptTool.name },
    }));
    this.logUsage("receipt", response.usage.input_tokens, response.usage.output_tokens);
    const block = response.content.find((item) => item.type === "tool_use" && item.name === receiptTool.name);
    if (!block || block.type !== "tool_use") throw new Error("Claude did not return a structured receipt");
    const raw = block.input as Record<string, unknown>;
    const rawReceipt = raw.receipt && typeof raw.receipt === "object" ? raw.receipt as Record<string, unknown> : null;
    const items = rawReceipt && Array.isArray(rawReceipt.items) ? rawReceipt.items.map((item) => {
      const candidate = item as Record<string, unknown>;
      const name = String(candidate.name ?? "");
      return { ...candidate, id: randomUUID(), name, normalizedName: normalizeItemName(name) };
    }) : [];
    return receiptAnalysisSchema.parse({
      classification: {
        isReceipt: raw.isReceipt,
        confidence: raw.classificationConfidence,
        reason: raw.rejectionReason,
        evidence: raw.receiptEvidence,
      },
      extraction: rawReceipt ? { ...rawReceipt, items } : null,
    });
  }

  async generateFeedback(facts: GroundingFacts) {
    const factEntries: Record<string, string> = {
      store: facts.store,
      satisfaction: String(facts.satisfaction),
      ...Object.fromEntries(facts.itemNames.map((name, index) => [`items.${index}`, name])),
      ...Object.fromEntries(facts.attributes.map((attribute) => [`attributes.${attribute}`, attribute])),
    };
    if (facts.employeeName) factEntries.employee = facts.employeeName;
    if (facts.notes) factEntries.notes = facts.notes;

    const response = await withTransientRetry(() => this.client.messages.create({
      model: this.model,
      max_tokens: 800,
      system: "Write concise first-person restaurant feedback. Use only the supplied fact map. Do not invent staff behaviour, speed, taste, cleanliness, emotion, or outcomes. Keep the tone proportional to satisfaction.",
      messages: [{ role: "user", content: `Confirmed fact map:\n${JSON.stringify(factEntries)}\nCreate a feedback draft with each claim citing its exact supporting keys.` }],
      tools: [feedbackTool],
      tool_choice: { type: "tool", name: feedbackTool.name },
    }));
    this.logUsage("feedback", response.usage.input_tokens, response.usage.output_tokens);
    const block = response.content.find((item) => item.type === "tool_use" && item.name === feedbackTool.name);
    if (!block || block.type !== "tool_use") throw new Error("Claude did not return grounded feedback claims");
    return feedbackResultSchema.parse(block.input);
  }

  private logUsage(operation: string, inputTokens: number, outputTokens: number) {
    console.info(`[receipt-relay] Claude ${operation} usage: ${inputTokens} input, ${outputTokens} output tokens`);
  }
}

async function withTransientRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      const transient = status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
      if (!transient || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
