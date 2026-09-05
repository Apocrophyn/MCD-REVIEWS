export type ReceiptStatus = "quality_review" | "needs_attention" | "ready_for_confirmation" | "draft" | "ready" | "scheduled" | "completed" | "failed" | "canceled";

export interface QualityAssessment {
  readable: boolean;
  fullReceipt: boolean;
  noGlare: boolean;
  width: number;
  height: number;
  brightness: number;
  message: string;
}

export interface ReceiptImage {
  id: string;
  receiptId: string;
  mimeType: string;
  size: number;
  quality: QualityAssessment;
}

export interface ReceiptItem {
  id: string;
  quantity: number;
  name: string;
  normalizedName: string;
  price: number;
  confidence: number;
}

export interface Experience {
  attributes: Array<"food_quality" | "service" | "cleanliness" | "wait_time" | "value" | "atmosphere">;
  satisfaction: number;
  notes: string;
  employeeId: string | null;
  attributeRatings: Partial<Record<"food_quality" | "service" | "cleanliness" | "wait_time" | "value" | "atmosphere", number>>;
  recommendLikelihood: number;
  returnIntent: number;
  orderType: "dine_in" | "takeaway" | "drive_thru" | "delivery" | "other";
  hadProblem: boolean;
  contactEmail: string;
  acceptSurveyTerms: boolean;
}

export type AutomationJobStatus = "queued" | "running" | "needs_attention" | "completed" | "failed";

export interface SurveyQuestionSummary {
  prompt: string;
  kind: "text" | "radio" | "checkbox" | "select" | "textarea";
  options: string[];
  answered: boolean;
  answer: string;
  required: boolean;
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
  questions: SurveyQuestionSummary[];
}

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
  dryRun: boolean;
  proof: string | null;
  transcript: SurveyPageSummary[];
}

export interface ReceiptClassification {
  isReceipt: boolean;
  confidence: number;
  reason: string;
  evidence: string[];
}

export interface Receipt {
  id: string;
  status: ReceiptStatus;
  createdAt: string;
  updatedAt: string;
  store: string;
  visitedAt: string | null;
  orderNumber: string;
  surveyCode: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: number;
  items: ReceiptItem[];
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

export interface SurveyPreparation {
  provider: string;
  url: string;
  participationCode: string;
  instructions: string;
  expiresGuidance: string;
}

export interface Health {
  ok: boolean;
  aiProvider: string;
  aiModel: string;
  aiSource: "settings" | "environment" | "none";
  analysisEnabled: boolean;
  feedbackEnabled: boolean;
  visionSupported: boolean;
  surveyAutomator: string;
  automationEnabled: boolean;
  showBrowser: boolean;
  maxUploadMb: number;
  maxImages: number;
}

export interface ProviderOption {
  id: string;
  label: string;
  credentialLabel: string;
  credentialHint: string;
  defaultModel: string;
  visionModels: string[];
  supportsVision: boolean;
  editableBaseUrl: boolean;
  notes: string;
  docsUrl: string;
  baseUrl: string;
}

export interface ProviderSettings {
  providers: ProviderOption[];
  credential: { providerId: string; model: string; baseUrl: string; maskedToken: string; updatedAt: string } | null;
  active: { name: string; model: string; source: "settings" | "environment" | "none"; supportsVision: boolean };
  environmentKeyPresent: boolean;
}

export interface CredentialVerification {
  ok: true;
  provider: string;
  model: string;
  supportsVision: boolean;
  warning: string | null;
}
