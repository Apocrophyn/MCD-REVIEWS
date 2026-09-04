import { describe, expect, it } from "vitest";
import { validateAndComposeFeedback } from "../server/domain/grounding.js";
import { normalizeItemName, normalizeSurveyCode, receiptFingerprint } from "../server/domain/normalize.js";
import { receiptAnalysisSchema } from "../server/domain/schemas.js";
import { assertTransition, canTransition } from "../server/domain/state-machine.js";
import { McDonaldsFoodForThoughtProvider } from "../server/survey/provider.js";
import { DisabledAIProvider } from "../server/ai/disabled-provider.js";

describe("receipt normalization", () => {
  it("normalizes known item aliases and survey code separators", () => {
    expect(normalizeItemName("  MED   FRIES ")).toBe("Medium Fries");
    expect(normalizeSurveyCode("ab-12 34/xy")).toBe("AB1234XY");
  });

  it("builds a stable duplicate fingerprint", () => {
    const first = receiptFingerprint({ store: "High Street", visitedAt: "2026-09-04T12:00:00Z", orderNumber: " 42 ", total: 10 });
    const second = receiptFingerprint({ store: " high street ", visitedAt: "2026-09-04T12:00:00Z", orderNumber: "42", total: 10 });
    expect(first).toBe(second);
  });
});

describe("queue state machine", () => {
  it("allows the intended approval lifecycle", () => {
    expect(canTransition("quality_review", "ready_for_confirmation")).toBe(true);
    expect(canTransition("draft", "ready")).toBe(true);
    expect(canTransition("ready", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "completed")).toBe(true);
  });

  it("rejects reopening a completed survey", () => {
    expect(() => assertTransition("completed", "draft")).toThrow("Cannot transition");
  });
});

describe("feedback grounding", () => {
  const facts = { store: "High Street Restaurant", itemNames: ["Medium Fries"], attributes: ["service"], satisfaction: 4, notes: "The counter was tidy." };

  it("composes claims supported by confirmed keys", () => {
    const feedback = validateAndComposeFeedback({ claims: [
      { text: "I had a good visit.", factKeys: ["satisfaction"] },
      { text: "The counter was tidy.", factKeys: ["notes"] },
    ] }, facts);
    expect(feedback).toBe("I had a good visit. The counter was tidy.");
  });

  it("rejects unsupported claims", () => {
    expect(() => validateAndComposeFeedback({ claims: [{ text: "I received a refund.", factKeys: ["refund"] }] }, facts)).toThrow("unsupported fact");
  });
});

describe("survey handoff", () => {
  it("prepares the official background automation target", () => {
    const result = new McDonaldsFoodForThoughtProvider().prepare({ surveyCode: "ABC123", visitedAt: null });
    expect(result.url).toBe("https://www.mcdfoodforthoughts.com/");
    expect(result.instructions).toContain("background browser");
  });
});

describe("receipt classification", () => {
  it("does not allow rejected images to carry extracted receipt data", () => {
    const result = receiptAnalysisSchema.safeParse({
      classification: { isReceipt: false, confidence: 0.99, reason: "A landscape photo is visible.", evidence: [] },
      extraction: {
        store: "Invented Store", visitedAt: null, orderNumber: "", surveyCode: "", currency: "GBP",
        subtotal: null, tax: null, total: null, confidence: 0.9, items: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("disables AI without returning hardcoded development data", async () => {
    const provider = new DisabledAIProvider();
    await expect(provider.analyzeReceipt([])).rejects.toThrow(/No sample data was substituted/);
    await expect(provider.generateFeedback({ store: "", itemNames: [], attributes: [], satisfaction: 3, notes: "" })).rejects.toThrow(/No hardcoded description/);
  });
});
