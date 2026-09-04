import type { FeedbackResult } from "./schemas.js";

export interface GroundingFacts {
  store: string;
  itemNames: string[];
  employeeName?: string;
  attributes: string[];
  satisfaction: number;
  notes: string;
}

export function buildFactMap(facts: GroundingFacts) {
  const map = new Map<string, string>([
    ["store", facts.store],
    ["satisfaction", String(facts.satisfaction)],
  ]);
  facts.itemNames.forEach((name, index) => map.set(`items.${index}`, name));
  facts.attributes.forEach((attribute) => map.set(`attributes.${attribute}`, attribute));
  if (facts.employeeName) map.set("employee", facts.employeeName);
  if (facts.notes) map.set("notes", facts.notes);
  return map;
}

export function validateAndComposeFeedback(result: FeedbackResult, facts: GroundingFacts) {
  const allowedFacts = buildFactMap(facts);
  for (const claim of result.claims) {
    for (const key of claim.factKeys) {
      if (!allowedFacts.has(key)) {
        throw new Error(`Feedback used an unsupported fact: ${key}`);
      }
    }
  }
  return result.claims.map((claim) => claim.text.replace(/\s+/g, " ").trim()).join(" ").slice(0, 500);
}
