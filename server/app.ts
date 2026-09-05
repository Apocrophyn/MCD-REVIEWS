import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import compression from "compression";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { z } from "zod";
import type { AIProvider, ReceiptImageInput } from "./ai/provider.js";
import { findProvider, providerCatalog } from "./ai/catalog.js";
import { resolveProvider, verifyCredential, type ResolvedProvider } from "./ai/factory.js";
import { DisabledAIProvider } from "./ai/disabled-provider.js";
import { TestAIProvider } from "./ai/test-provider.js";
import { type AppConfig, loadConfig } from "./config.js";
import { DuplicateReceiptError, ReceiptRepository } from "./database.js";
import { validateAndComposeFeedback, type GroundingFacts } from "./domain/grounding.js";
import { formatSurveyCode, isValidSurveyCode, normalizeItemName, normalizeSurveyCode } from "./domain/normalize.js";
import { experienceSchema, receiptExtractionSchema } from "./domain/schemas.js";
import { maskToken, SettingsStore, type StoredCredential } from "./settings.js";
import { ImageValidationError, inspectImage } from "./image-quality.js";
import { McDonaldsFoodForThoughtProvider, type SurveyProvider } from "./survey/provider.js";
import { PlaywrightSurveyAutomator, TestSurveyAutomator, type SurveyAutomationPayload, type SurveyAutomator } from "./survey/automation.js";

interface AppDependencies {
  config?: AppConfig;
  repository?: ReceiptRepository;
  aiProvider?: AIProvider;
  surveyProvider?: SurveyProvider;
  surveyAutomator?: SurveyAutomator;
}

const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => void handler(req, res, next).catch(next);

const updateSchema = receiptExtractionSchema.partial().extend({
  feedback: z.string().trim().max(500).optional(),
  experience: experienceSchema.nullable().optional(),
});

const employeeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80).default(""),
});

const credentialSchema = z.object({
  providerId: z.string().trim().min(1),
  token: z.string().trim().min(8).max(500),
  model: z.string().trim().max(120).default(""),
  baseUrl: z.union([z.url(), z.literal("")]).default(""),
});

const automationRequestSchema = z.object({ dryRun: z.boolean().default(false) });

export function createApp(dependencies: AppDependencies = {}) {
  const config = dependencies.config ?? loadConfig();
  fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(config.proofDir, { recursive: true, mode: 0o700 });
  const repository = dependencies.repository ?? new ReceiptRepository(config.databasePath);
  const settings = new SettingsStore(repository.db, config.settingsKeyPath);

  // The active model provider is resolved on every request so a credential
  // saved in Settings takes effect without restarting the server.
  const injectedProvider = dependencies.aiProvider ?? (config.NODE_ENV === "test" && !config.ANTHROPIC_API_KEY ? new TestAIProvider() : undefined);
  const currentProvider = (): ResolvedProvider => injectedProvider
    ? { provider: injectedProvider, definition: null, model: config.ANTHROPIC_MODEL, supportsVision: true, source: "environment" }
    : resolveProvider(settings.getCredential(), { apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL });

  const surveyProvider = dependencies.surveyProvider ?? new McDonaldsFoodForThoughtProvider();
  const surveyAutomator = dependencies.surveyAutomator ?? (config.NODE_ENV === "test"
    ? new TestSurveyAutomator()
    : new PlaywrightSurveyAutomator({ proofDir: config.proofDir, showBrowser: settings.getAutomationPreferences().showBrowser }));
  repository.recoverAutomationJobs();
  let automationQueue = Promise.resolve();
  const app = express();

  const enqueueAutomation = (jobId: string, receiptId: string, payload: SurveyAutomationPayload) => {
    automationQueue = automationQueue.then(async () => {
      const startedAt = new Date().toISOString();
      repository.updateAutomationJob(jobId, { status: "running", progress: 3, message: "Starting the private background browser", startedAt });
      try {
        const result = await surveyAutomator.run(payload, (progress, message) => {
          repository.updateAutomationJob(jobId, { progress: Math.max(0, Math.min(100, Math.round(progress))), message });
        });
        const completedAt = new Date().toISOString();
        if (result.outcome === "completed") {
          // Only a real submission moves the receipt to completed.
          const receipt = repository.getReceipt(receiptId);
          if (receipt && ["ready", "scheduled"].includes(receipt.status)) repository.updateReceipt(receiptId, { status: "completed", scheduledAt: null });
          repository.updateAutomationJob(jobId, { status: "completed", progress: 100, message: result.message, completedAt, proof: result.proof, transcript: result.transcript });
        } else if (result.outcome === "dry_run_complete") {
          repository.updateAutomationJob(jobId, { status: "completed", progress: 100, message: result.message, completedAt, proof: result.proof, transcript: result.transcript });
        } else {
          repository.updateAutomationJob(jobId, { status: "needs_attention", message: result.message, completedAt, proof: result.proof, transcript: result.transcript });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "The background browser could not complete the survey";
        repository.updateAutomationJob(jobId, { status: "failed", message: config.NODE_ENV === "production" ? "The background browser could not complete the survey." : message, completedAt: new Date().toISOString() });
      }
    });
  };

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: config.NODE_ENV === "production" ? undefined : false }));
  app.use(compression());
  app.use(express.json({ limit: "200kb" }));
  app.use("/api", rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === "test" ? 10_000 : 120, standardHeaders: "draft-8", legacyHeaders: false }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: config.MAX_IMAGES_PER_RECEIPT },
  });

  app.get("/api/health", (_req, res) => {
    const active = currentProvider();
    const configured = !(active.provider instanceof DisabledAIProvider);
    res.json({
      ok: true,
      aiProvider: active.provider.name,
      aiModel: active.model,
      aiSource: active.source,
      analysisEnabled: configured && active.supportsVision,
      feedbackEnabled: configured,
      visionSupported: active.supportsVision,
      surveyAutomator: surveyAutomator.name,
      automationEnabled: surveyAutomator.available,
      showBrowser: settings.getAutomationPreferences().showBrowser,
      maxUploadMb: config.MAX_UPLOAD_MB,
      maxImages: config.MAX_IMAGES_PER_RECEIPT,
    });
  });

  app.get("/api/settings/providers", (_req, res) => {
    const credential = settings.getCredential();
    const active = currentProvider();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      providers: providerCatalog.map(({ id, label, credentialLabel, credentialHint, defaultModel, visionModels, supportsVision, editableBaseUrl, notes, docsUrl, baseUrl }) => ({
        id, label, credentialLabel, credentialHint, defaultModel, visionModels, supportsVision, editableBaseUrl, notes, docsUrl, baseUrl,
      })),
      // The token itself never leaves the server; only a recognisable mask does.
      credential: credential
        ? { providerId: credential.providerId, model: credential.model, baseUrl: credential.baseUrl, maskedToken: maskToken(credential.token), updatedAt: credential.updatedAt }
        : null,
      active: { name: active.provider.name, model: active.model, source: active.source, supportsVision: active.supportsVision },
      environmentKeyPresent: Boolean(config.ANTHROPIC_API_KEY),
    });
  });

  app.put("/api/settings/credential", asyncRoute(async (req, res) => {
    const input = credentialSchema.parse(req.body);
    const definition = findProvider(input.providerId);
    if (!definition) return res.status(400).json({ error: "Choose one of the supported model providers" });
    if (definition.tokenPrefixes.length && !definition.tokenPrefixes.some((prefix) => input.token.startsWith(prefix))) {
      return res.status(400).json({ error: `That does not look like a ${definition.credentialLabel}. It should start with ${definition.tokenPrefixes.join(" or ")}.` });
    }
    if (definition.editableBaseUrl && !input.baseUrl) return res.status(400).json({ error: "A custom endpoint needs its base URL" });
    const credential: StoredCredential = {
      providerId: input.providerId,
      token: input.token,
      model: input.model || definition.defaultModel,
      baseUrl: input.baseUrl,
      updatedAt: new Date().toISOString(),
    };
    try {
      const verification = await verifyCredential(credential);
      settings.setCredential(credential);
      return res.json({ ...verification });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The credential could not be verified";
      return res.status(400).json({ error: `${definition.label} rejected that credential: ${message}` });
    }
  }));

  app.delete("/api/settings/credential", (_req, res) => {
    settings.clearCredential();
    res.status(204).end();
  });

  app.put("/api/settings/automation", (req, res, next) => {
    try {
      const input = z.object({ showBrowser: z.boolean() }).parse(req.body);
      settings.setAutomationPreferences(input);
      if (surveyAutomator instanceof PlaywrightSurveyAutomator) surveyAutomator.setShowBrowser(input.showBrowser);
      return res.json(input);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/receipts", (req, res) => {
    res.json({ receipts: repository.listReceipts(req.query.archived === "true") });
  });

  app.post("/api/receipts", upload.array("images", config.MAX_IMAGES_PER_RECEIPT), asyncRoute(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ error: "Add at least one receipt image" });
    const inspected = await Promise.all(files.map(async (file) => ({ file, inspection: await inspectImage(file.buffer) })));
    const hashes = files.map((file) => createHash("sha256").update(file.buffer).digest("hex"));
    const duplicate = repository.findDuplicateBySha(hashes);
    if (duplicate) return res.status(409).json({ error: "This receipt image was already uploaded", duplicate });

    const receiptId = randomUUID();
    const savedPaths: string[] = [];
    try {
      const images = await Promise.all(inspected.map(async ({ file, inspection }, index) => {
        const id = randomUUID();
        const extension = inspection.format === "jpeg" ? "jpg" : inspection.format;
        const fileName = `${randomUUID()}.${extension}`;
        const destination = path.join(config.uploadDir, fileName);
        await fs.promises.writeFile(destination, file.buffer, { mode: 0o600, flag: "wx" });
        savedPaths.push(destination);
        return { id, fileName, mimeType: inspection.mimeType, size: file.size, sha256: hashes[index], quality: inspection.quality };
      }));
      const receipt = repository.createReceipt(receiptId, images, "quality_review");
      return res.status(201).json({ receipt });
    } catch (error) {
      await Promise.all(savedPaths.map((filePath) => fs.promises.unlink(filePath).catch(() => undefined)));
      if (error instanceof DuplicateReceiptError) {
        const duplicate = repository.getReceipt(error.receiptId);
        return res.status(409).json({ error: error.message, duplicate });
      }
      throw error;
    }
  }));

  app.get("/api/receipts/:id", (req, res) => {
    const receipt = repository.getReceipt(req.params.id);
    if (!receipt) return res.status(404).json({ error: "Receipt not found" });
    return res.json({ receipt });
  });

  app.get("/api/receipts/:id/images/:imageId", asyncRoute(async (req, res) => {
    const image = repository.getImage(String(req.params.id), String(req.params.imageId));
    if (!image) return res.status(404).json({ error: "Image not found" });
    res.setHeader("Content-Type", image.mime_type);
    res.setHeader("Cache-Control", "private, max-age=300");
    const bytes = await fs.promises.readFile(path.join(config.uploadDir, image.file_name));
    return res.send(bytes);
  }));

  app.post("/api/receipts/:id/analyze", asyncRoute(async (req, res) => {
    let receipt = repository.getReceipt(String(req.params.id));
    if (!receipt) return res.status(404).json({ error: "Receipt not found" });
    if (!["quality_review", "needs_attention", "failed"].includes(receipt.status)) {
      return res.status(409).json({ error: "This receipt cannot be analysed in its current state" });
    }
    if (receipt.status === "failed") receipt = repository.updateReceipt(receipt.id, { status: "quality_review", failureReason: null })!;
    const inputs = await Promise.all(receipt.images.map(async (image): Promise<ReceiptImageInput> => ({
      buffer: await fs.promises.readFile(path.join(config.uploadDir, image.fileName)),
      mimeType: image.mimeType as ReceiptImageInput["mimeType"],
    })));
    const active = currentProvider();
    if (!active.supportsVision && !(active.provider instanceof DisabledAIProvider)) {
      return res.status(400).json({ error: `${active.provider.name} cannot read images. Choose a vision-capable model in Settings, or enter the receipt details by hand.` });
    }
    try {
      const analysis = await active.provider.analyzeReceipt(inputs);
      const accepted = analysis.classification.isReceipt
        && analysis.classification.confidence >= 0.75
        && analysis.classification.evidence.length >= 2
        && analysis.extraction;
      if (!accepted) {
        const reason = analysis.classification.reason || "The image does not contain enough evidence of a transaction receipt.";
        const updated = repository.updateReceipt(receipt.id, { classification: analysis.classification, status: "needs_attention", failureReason: reason });
        return res.json({ receipt: updated });
      }
      const extraction = analysis.extraction!;
      const normalized = {
        ...extraction,
        surveyCode: normalizeSurveyCode(extraction.surveyCode),
        items: extraction.items.map((item) => ({ ...item, normalizedName: normalizeItemName(item.normalizedName || item.name) })),
      };
      const updated = repository.updateReceipt(receipt.id, {
        ...normalized,
        classification: analysis.classification,
        failureReason: null,
        status: extraction.confidence < 0.65 ? "needs_attention" : "ready_for_confirmation",
      });
      return res.json({ receipt: updated });
    } catch (error) {
      repository.updateReceipt(receipt.id, { status: "failed", failureReason: error instanceof Error ? error.message : "Receipt analysis failed" });
      throw error;
    }
  }));

  app.patch("/api/receipts/:id", (req, res, next) => {
    try {
      const current = repository.getReceipt(req.params.id);
      if (!current) return res.status(404).json({ error: "Receipt not found" });
      const update = updateSchema.parse(req.body);
      const items = update.items?.map((item) => ({ ...item, normalizedName: normalizeItemName(item.normalizedName || item.name) }));
      const status = current.status === "ready_for_confirmation" ? "draft" as const : undefined;
      const surveyCode = update.surveyCode === undefined ? undefined : normalizeSurveyCode(update.surveyCode);
      const receipt = repository.updateReceipt(current.id, { ...update, surveyCode, items, status });
      return res.json({ receipt });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/receipts/:id/feedback", asyncRoute(async (req, res) => {
    const receipt = repository.getReceipt(String(req.params.id));
    if (!receipt) return res.status(404).json({ error: "Receipt not found" });
    const experience = experienceSchema.parse(req.body);
    const employee = experience.employeeId ? repository.getEmployee(experience.employeeId) : null;
    if (experience.employeeId && !employee) return res.status(400).json({ error: "Selected employee no longer exists" });
    const facts: GroundingFacts = {
      store: receipt.store,
      itemNames: receipt.items.map((item) => item.normalizedName),
      employeeName: employee?.name,
      attributes: experience.attributes,
      satisfaction: experience.satisfaction,
      notes: experience.notes,
    };
    const claims = await currentProvider().provider.generateFeedback(facts);
    const feedback = validateAndComposeFeedback(claims, facts);
    const updated = repository.updateReceipt(receipt.id, { experience, feedback, status: receipt.status === "ready_for_confirmation" ? "draft" : undefined });
    return res.json({ receipt: updated });
  }));

  app.post("/api/receipts/:id/approve", (req, res, next) => {
    try {
      const receipt = repository.getReceipt(req.params.id);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      if (!receipt.store || !receipt.surveyCode || !receipt.experience || !receipt.feedback.trim()) {
        return res.status(400).json({ error: "Confirm the receipt, experience, and feedback before approval" });
      }
      if (!isValidSurveyCode(receipt.surveyCode)) return res.status(400).json({ error: "Confirm the 12-character Food for Thoughts code printed under \u201CTell us how we did\u201D (for example MKYW-ZM3N-L9VG)" });
      if (receipt.total == null || receipt.total <= 0 || receipt.total > 999.99) return res.status(400).json({ error: "Confirm the amount spent on the receipt" });
      if (!receipt.experience.acceptSurveyTerms) return res.status(400).json({ error: "Confirm the official survey terms before approval" });
      const preparation = surveyProvider.prepare(receipt);
      const updated = repository.updateReceipt(receipt.id, { status: "ready" });
      return res.json({ receipt: updated, preparation });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/receipts/:id/schedule", (req, res, next) => {
    try {
      const receipt = repository.getReceipt(req.params.id);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      const { scheduledAt } = z.object({ scheduledAt: z.iso.datetime() }).parse(req.body);
      if (Date.parse(scheduledAt) <= Date.now()) return res.status(400).json({ error: "Choose a future reminder time" });
      const updated = repository.updateReceipt(receipt.id, { status: "scheduled", scheduledAt });
      return res.json({ receipt: updated });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/receipts/:id/automation", (req, res, next) => {
    try {
      const { dryRun } = automationRequestSchema.parse(req.body ?? {});
      const receipt = repository.getReceipt(String(req.params.id));
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      if (!["ready", "scheduled"].includes(receipt.status) || !receipt.experience || !receipt.feedback) {
        return res.status(409).json({ error: "Approve the confirmed receipt and feedback before running the survey" });
      }
      if (!isValidSurveyCode(receipt.surveyCode)) {
        return res.status(400).json({ error: "Food for Thoughts requires the 12-character code printed under \u201CTell us how we did\u201D (for example MKYW-ZM3N-L9VG)" });
      }
      if (receipt.total == null || receipt.total <= 0 || receipt.total > 999.99) return res.status(400).json({ error: "Confirm the receipt amount before starting the survey" });
      if (!surveyAutomator.available) return res.status(503).json({ error: "The background browser is not installed. Run: npx playwright install chromium" });
      if (!receipt.experience.acceptSurveyTerms) return res.status(400).json({ error: "Confirm the survey terms before starting background completion" });
      const active = repository.getActiveAutomationJob(receipt.id);
      if (active) return res.status(202).json({ job: active });
      const now = new Date().toISOString();
      const job = repository.createAutomationJob({
        id: randomUUID(), receiptId: receipt.id, status: "queued", progress: 0,
        message: dryRun ? "Waiting to start a practice run" : "Waiting to start", createdAt: now, updatedAt: now, dryRun,
      });
      const payload: SurveyAutomationPayload = {
        receipt: {
          store: receipt.store,
          visitedAt: receipt.visitedAt,
          orderNumber: receipt.orderNumber,
          surveyCode: receipt.surveyCode,
          total: receipt.total,
          items: receipt.items.map((item) => ({ quantity: item.quantity, name: item.normalizedName })),
        },
        experience: receipt.experience,
        feedback: receipt.feedback,
        dryRun,
      };
      enqueueAutomation(job.id, receipt.id, payload);
      return res.status(202).json({ job });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/automation/jobs/:id/proof/:file", asyncRoute(async (req, res) => {
    const fileName = repository.findAutomationProof(String(req.params.id), String(req.params.file));
    if (!fileName) return res.status(404).json({ error: "Screenshot not found" });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(await fs.promises.readFile(path.join(config.proofDir, fileName)));
  }));

  app.get("/api/automation/jobs/:id", (req, res) => {
    const job = repository.getAutomationJob(String(req.params.id));
    if (!job) return res.status(404).json({ error: "Survey job not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ job });
  });

  app.get("/api/receipts/:id/automation/latest", (req, res) => {
    if (!repository.getReceipt(String(req.params.id))) return res.status(404).json({ error: "Receipt not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ job: repository.getLatestAutomationJob(String(req.params.id)) });
  });

  app.post("/api/receipts/:id/complete", (req, res, next) => {
    try {
      const receipt = repository.getReceipt(req.params.id);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      return res.json({ receipt: repository.updateReceipt(receipt.id, { status: "completed", scheduledAt: null }) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/receipts/:id/cancel", (req, res, next) => {
    try {
      const receipt = repository.getReceipt(req.params.id);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      return res.json({ receipt: repository.updateReceipt(receipt.id, { status: "canceled", scheduledAt: null }) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/receipts/:id/archive", (req, res) => {
    const receipt = repository.getReceipt(req.params.id);
    if (!receipt) return res.status(404).json({ error: "Receipt not found" });
    return res.json({ receipt: repository.updateReceipt(receipt.id, { archivedAt: new Date().toISOString() }) });
  });

  app.delete("/api/receipts/:id", asyncRoute(async (req, res) => {
    const proofs = repository.listAutomationProofs(String(req.params.id));
    const result = repository.deleteReceipt(String(req.params.id));
    if (!result.deleted) return res.status(404).json({ error: "Receipt not found" });
    await Promise.all([
      ...result.images.map((image) => fs.promises.unlink(path.join(config.uploadDir, image.file_name)).catch(() => undefined)),
      ...proofs.map((fileName) => fs.promises.unlink(path.join(config.proofDir, fileName)).catch(() => undefined)),
    ]);
    return res.status(204).end();
  }));

  app.get("/api/employees", (req, res) => {
    res.json({ employees: repository.listEmployees(typeof req.query.q === "string" ? req.query.q : "") });
  });

  app.post("/api/employees", (req, res, next) => {
    try {
      const input = employeeSchema.parse(req.body);
      const employee = repository.createEmployee({ id: randomUUID(), ...input, createdAt: new Date().toISOString() });
      return res.status(201).json({ employee });
    } catch (error) {
      return next(error);
    }
  });

  if (config.NODE_ENV === "production") {
    const dist = path.resolve("dist");
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE" ? `Each image must be ${config.MAX_UPLOAD_MB} MB or smaller` : error.message;
      return res.status(400).json({ error: message });
    }
    if (error instanceof ImageValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Some submitted fields are invalid", details: error.issues });
    const message = error instanceof Error ? error.message : "Unexpected server error";
    if (config.NODE_ENV !== "test") console.error(`[receipt-relay] ${message}`);
    return res.status(500).json({ error: config.NODE_ENV === "production" ? "Something went wrong" : message });
  });

  return { app, repository, settings, currentProvider, surveyAutomator, config };
}
