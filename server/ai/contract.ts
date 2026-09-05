import { randomUUID } from "node:crypto";
import { normalizeItemName } from "../domain/normalize.js";
import { receiptAnalysisSchema } from "../domain/schemas.js";
import type { GroundingFacts } from "../domain/grounding.js";

/**
 * The one receipt/feedback contract every model provider must satisfy.
 *
 * Keeping the schema, the instructions, and the response parsing here means
 * Claude, OpenAI, DeepSeek, and Llama-style endpoints are all held to the same
 * classify-before-extract rule instead of each drifting into its own prompt.
 */

export const RECEIPT_TOOL_NAME = "classify_and_record_receipt";
export const FEEDBACK_TOOL_NAME = "record_feedback_claims";

export const receiptToolDescription =
  "First decide whether the supplied images show a real transaction receipt. Only record receipt fields when receipt-specific evidence is visible.";

export const receiptToolSchema = {
  type: "object" as const,
  required: ["isReceipt", "classificationConfidence", "rejectionReason", "receiptEvidence", "receipt"],
  properties: {
    isReceipt: {
      type: "boolean",
      description:
        "True only when at least two independent receipt signals are visible, such as a merchant name, priced line items, a transaction date/time, an order or transaction number, a subtotal/tax/total block, a payment/card line, or a printed survey invitation code.",
    },
    classificationConfidence: { type: "number", minimum: 0, maximum: 1 },
    rejectionReason: { type: "string", description: "Plain-language reason when isReceipt is false; short confirmation when true." },
    receiptEvidence: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
      description: "Each entry names one receipt signal actually visible in the image. Never list a signal you cannot see.",
    },
    receipt: {
      type: ["object", "null"],
      description: "Null whenever isReceipt is false.",
      required: ["store", "visitedAt", "orderNumber", "surveyCode", "currency", "subtotal", "tax", "total", "confidence", "items"],
      properties: {
        store: { type: "string", description: "Merchant name, including the branch or street when printed." },
        visitedAt: { type: ["string", "null"], description: "ISO 8601 date/time of the transaction when legible. UK receipts print DD-MM-YYYY." },
        orderNumber: { type: "string", description: "The printed order number. On McDonald's UK receipts this is the large boxed number at the very top." },
        surveyCode: {
          type: "string",
          description:
            "The printed survey invitation code exactly as shown, keeping letters and digits. McDonald's UK prints a 12-character alphanumeric code grouped as XXXX-XXXX-XXXX under 'Tell us how we did'. Empty string when no survey code is printed.",
        },
        currency: { type: "string", minLength: 3, maxLength: 3, description: "ISO 4217 code. A '£' total means GBP." },
        subtotal: { type: ["number", "null"], minimum: 0 },
        tax: { type: ["number", "null"], minimum: 0, description: "The VAT/tax amount when printed." },
        total: { type: ["number", "null"], minimum: 0, description: "The amount actually paid, including VAT." },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        items: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            required: ["quantity", "name", "price", "confidence"],
            properties: {
              quantity: { type: "integer", minimum: 1 },
              name: { type: "string", description: "The item name exactly as printed." },
              price: { type: "number", minimum: 0 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  },
};

export const receiptInstruction = [
  "Classify before extracting.",
  "A photograph, screenshot, menu, poster, document, product, person, or object is not a receipt merely because it contains text, numbers, or prices.",
  "Require at least two independent transaction-receipt signals that you can actually read in the image.",
  "If the image is not a printed or digital transaction receipt, or if you are uncertain, set isReceipt=false, receipt=null, and explain what you actually see.",
  "Merge multiple images only when they clearly show the same physical receipt.",
  "Preserve printed item names verbatim and never infer a value you cannot read.",
].join(" ");

export const feedbackToolDescription =
  "Return a short natural feedback draft split into claims. Every claim must cite one or more supplied fact keys and may not introduce unsupported details.";

export const feedbackToolSchema = {
  type: "object" as const,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        required: ["text", "factKeys"],
        properties: {
          text: { type: "string", maxLength: 240 },
          factKeys: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        },
      },
    },
  },
};

export const feedbackSystemPrompt =
  "Write concise first-person restaurant feedback. Use only the supplied fact map. Do not invent staff behaviour, speed, taste, cleanliness, emotion, or outcomes. Keep the tone proportional to satisfaction.";

export function buildFactEntries(facts: GroundingFacts) {
  const entries: Record<string, string> = {
    store: facts.store,
    satisfaction: String(facts.satisfaction),
    ...Object.fromEntries(facts.itemNames.map((name, index) => [`items.${index}`, name])),
    ...Object.fromEntries(facts.attributes.map((attribute) => [`attributes.${attribute}`, attribute])),
  };
  if (facts.employeeName) entries.employee = facts.employeeName;
  if (facts.notes) entries.notes = facts.notes;
  return entries;
}

export function feedbackUserPrompt(facts: GroundingFacts) {
  return `Confirmed fact map:\n${JSON.stringify(buildFactEntries(facts))}\nCreate a feedback draft with each claim citing its exact supporting keys.`;
}

/** Turns any provider's raw tool arguments into a validated ReceiptAnalysis. */
export function parseReceiptToolResult(raw: Record<string, unknown>) {
  const rawReceipt = raw.receipt && typeof raw.receipt === "object" ? (raw.receipt as Record<string, unknown>) : null;
  const isReceipt = raw.isReceipt === true;
  const items = rawReceipt && Array.isArray(rawReceipt.items)
    ? rawReceipt.items.map((item) => {
        const candidate = item as Record<string, unknown>;
        const name = String(candidate.name ?? "");
        return { ...candidate, id: randomUUID(), name, normalizedName: normalizeItemName(name) };
      })
    : [];
  return receiptAnalysisSchema.parse({
    classification: {
      isReceipt,
      confidence: raw.classificationConfidence,
      reason: raw.rejectionReason,
      evidence: Array.isArray(raw.receiptEvidence) ? raw.receiptEvidence : [],
    },
    // A model that says "not a receipt" but still fills the receipt object must
    // not smuggle invented fields past the classification gate.
    extraction: isReceipt && rawReceipt ? { ...rawReceipt, items } : null,
  });
}
