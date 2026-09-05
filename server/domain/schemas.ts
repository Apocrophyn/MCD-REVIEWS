import { z } from "zod";

export const confidenceSchema = z.number().min(0).max(1);

export const qualitySchema = z.object({
  readable: z.boolean(),
  fullReceipt: z.boolean(),
  noGlare: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  brightness: z.number().min(0).max(255),
  message: z.string(),
});

export const receiptItemSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  normalizedName: z.string().trim().min(1).max(120),
  price: z.number().nonnegative(),
  confidence: confidenceSchema,
});

export const receiptExtractionSchema = z.object({
  store: z.string().trim().min(1).max(160),
  visitedAt: z.string().nullable(),
  orderNumber: z.string().trim().max(80),
  surveyCode: z.string().trim().max(120),
  currency: z.string().trim().length(3).default("GBP"),
  subtotal: z.number().nonnegative().nullable(),
  tax: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(),
  confidence: confidenceSchema,
  items: z.array(receiptItemSchema).max(100),
});

export const receiptClassificationSchema = z.object({
  isReceipt: z.boolean(),
  confidence: confidenceSchema,
  reason: z.string().trim().min(1).max(300),
  evidence: z.array(z.string().trim().min(1).max(120)).max(8),
});

export const receiptAnalysisSchema = z.object({
  classification: receiptClassificationSchema,
  extraction: receiptExtractionSchema.nullable(),
}).superRefine((value, context) => {
  if (value.classification.isReceipt && !value.extraction) {
    context.addIssue({ code: "custom", message: "A classified receipt requires an extraction", path: ["extraction"] });
  }
  if (!value.classification.isReceipt && value.extraction) {
    context.addIssue({ code: "custom", message: "A rejected image cannot include receipt data", path: ["extraction"] });
  }
});

export const experienceSchema = z.object({
  attributes: z.array(z.enum(["food_quality", "service", "cleanliness", "wait_time", "value", "atmosphere"])).max(6),
  satisfaction: z.number().int().min(1).max(5),
  notes: z.string().trim().max(500),
  employeeId: z.string().nullable(),
  attributeRatings: z.partialRecord(z.enum(["food_quality", "service", "cleanliness", "wait_time", "value", "atmosphere"]), z.number().int().min(1).max(5)).default({}),
  recommendLikelihood: z.number().int().min(0).max(10).default(8),
  returnIntent: z.number().int().min(1).max(5).default(4),
  orderType: z.enum(["dine_in", "takeaway", "drive_thru", "delivery", "other"]).default("takeaway"),
  hadProblem: z.boolean().default(false),
  contactEmail: z.union([z.email(), z.literal("")]).default(""),
  acceptSurveyTerms: z.boolean().default(false),
});

export const feedbackClaimSchema = z.object({
  text: z.string().trim().min(1).max(240),
  factKeys: z.array(z.string().trim().min(1)).min(1).max(8),
});

export const feedbackResultSchema = z.object({
  claims: z.array(feedbackClaimSchema).min(1).max(6),
});

export const receiptStatusSchema = z.enum([
  "quality_review",
  "needs_attention",
  "ready_for_confirmation",
  "draft",
  "ready",
  "scheduled",
  "completed",
  "failed",
  "canceled",
]);

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
export type ReceiptAnalysis = z.infer<typeof receiptAnalysisSchema>;
export type ReceiptClassification = z.infer<typeof receiptClassificationSchema>;
export type ReceiptItem = z.infer<typeof receiptItemSchema>;
export type QualityAssessment = z.infer<typeof qualitySchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type ReceiptStatus = z.infer<typeof receiptStatusSchema>;
export type FeedbackResult = z.infer<typeof feedbackResultSchema>;

export type AutomationJobStatus = "queued" | "running" | "needs_attention" | "completed" | "failed";

export interface AutomationJob {
  id: string;
  receiptId: string;
  status: AutomationJobStatus;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** A practice run fills every page but never submits. */
  dryRun: boolean;
  /** Screenshot file name of the final page: the user's proof of submission. */
  proof: string | null;
  /** What each survey page actually asked, recorded as the run went. */
  transcript: SurveyPageSummary[];
}

export interface SurveyPageSummary {
  index: number;
  url: string;
  heading: string;
  filled: number;
  unansweredRequired: number;
  action: string | null;
  actionKind: "next" | "submit" | null;
  screenshot: string | null;
  questions: Array<{
    prompt: string;
    kind: "text" | "radio" | "checkbox" | "select" | "textarea";
    options: string[];
    answered: boolean;
    answer: string;
    required: boolean;
  }>;
}

export interface ReceiptImage {
  id: string;
  receiptId: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  quality: QualityAssessment;
}

export interface Receipt extends ReceiptExtraction {
  id: string;
  status: ReceiptStatus;
  createdAt: string;
  updatedAt: string;
  images: ReceiptImage[];
  experience: Experience | null;
  feedback: string;
  scheduledAt: string | null;
  archivedAt: string | null;
  failureReason: string | null;
  classification: ReceiptClassification | null;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}
