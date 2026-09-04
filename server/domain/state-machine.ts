import type { ReceiptStatus } from "./schemas.js";

const transitions: Record<ReceiptStatus, ReadonlySet<ReceiptStatus>> = {
  quality_review: new Set(["needs_attention", "ready_for_confirmation", "canceled"]),
  needs_attention: new Set(["quality_review", "ready_for_confirmation", "canceled", "failed"]),
  ready_for_confirmation: new Set(["draft", "ready", "canceled", "failed"]),
  draft: new Set(["ready_for_confirmation", "ready", "canceled"]),
  ready: new Set(["scheduled", "completed", "canceled"]),
  scheduled: new Set(["ready", "completed", "canceled"]),
  completed: new Set([]),
  failed: new Set(["quality_review", "ready_for_confirmation", "canceled"]),
  canceled: new Set(["quality_review"]),
};

export function canTransition(from: ReceiptStatus, to: ReceiptStatus) {
  return from === to || transitions[from].has(to);
}

export function assertTransition(from: ReceiptStatus, to: ReceiptStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot transition receipt from ${from} to ${to}`);
  }
}
