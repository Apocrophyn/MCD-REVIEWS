import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AutomationJob, AutomationJobStatus, Employee, Experience, QualityAssessment, Receipt, ReceiptClassification, ReceiptImage, ReceiptStatus, SurveyPageSummary } from "./domain/schemas.js";
import { assertTransition } from "./domain/state-machine.js";

interface ReceiptRow {
  id: string;
  status: ReceiptStatus;
  created_at: string;
  updated_at: string;
  store: string;
  visited_at: string | null;
  order_number: string;
  survey_code: string;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: number;
  items_json: string;
  experience_json: string | null;
  feedback: string;
  scheduled_at: string | null;
  archived_at: string | null;
  failure_reason: string | null;
  classification_json: string | null;
}

interface ImageRow {
  id: string;
  receipt_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  sha256: string;
  quality_json: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  role: string;
  created_at: string;
}

interface AutomationJobRow {
  id: string;
  receipt_id: string;
  status: AutomationJobStatus;
  progress: number;
  message: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  dry_run: number;
  proof_file: string | null;
  transcript_json: string | null;
}

export class DuplicateReceiptError extends Error {
  constructor(readonly receiptId: string) {
    super("This receipt image was already uploaded");
  }
}

export class ReceiptRepository {
  readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(databasePath === ":memory:" ? "." : path.dirname(databasePath), { recursive: true, mode: 0o700 });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        store TEXT NOT NULL DEFAULT '',
        visited_at TEXT,
        order_number TEXT NOT NULL DEFAULT '',
        survey_code TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'GBP',
        subtotal REAL,
        tax REAL,
        total REAL,
        confidence REAL NOT NULL DEFAULT 0,
        items_json TEXT NOT NULL DEFAULT '[]',
        experience_json TEXT,
        feedback TEXT NOT NULL DEFAULT '',
        scheduled_at TEXT,
        archived_at TEXT,
        failure_reason TEXT,
        classification_json TEXT
      );
      CREATE TABLE IF NOT EXISTS receipt_images (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        quality_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS receipt_images_sha_idx ON receipt_images(sha256);
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        role TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS employees_name_idx ON employees(name);
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS automation_jobs (
        id TEXT PRIMARY KEY,
        receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        dry_run INTEGER NOT NULL DEFAULT 0,
        proof_file TEXT,
        transcript_json TEXT
      );
      CREATE INDEX IF NOT EXISTS automation_jobs_receipt_idx ON automation_jobs(receipt_id, created_at DESC);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, datetime('now'));
    `);
    const columns = this.db.prepare("PRAGMA table_info(receipts)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "classification_json")) {
      this.db.exec("ALTER TABLE receipts ADD COLUMN classification_json TEXT");
    }
    const jobColumns = this.db.prepare("PRAGMA table_info(automation_jobs)").all() as Array<{ name: string }>;
    const addJobColumn = (name: string, definition: string) => {
      if (!jobColumns.some((column) => column.name === name)) this.db.exec(`ALTER TABLE automation_jobs ADD COLUMN ${name} ${definition}`);
    };
    addJobColumn("dry_run", "INTEGER NOT NULL DEFAULT 0");
    addJobColumn("proof_file", "TEXT");
    addJobColumn("transcript_json", "TEXT");
  }

  close() {
    this.db.close();
  }

  createReceipt(id: string, images: Array<Omit<ReceiptImage, "receiptId">>, status: ReceiptStatus) {
    const now = new Date().toISOString();
    const insert = this.db.transaction(() => {
      const hashes = images.map((image) => image.sha256);
      const placeholders = hashes.map(() => "?").join(",");
      const duplicate = this.db.prepare(`SELECT receipt_id FROM receipt_images WHERE sha256 IN (${placeholders}) LIMIT 1`).get(...hashes) as { receipt_id: string } | undefined;
      if (duplicate) throw new DuplicateReceiptError(duplicate.receipt_id);
      this.db.prepare("INSERT INTO receipts (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, status, now, now);
      const statement = this.db.prepare(`
        INSERT INTO receipt_images (id, receipt_id, file_name, mime_type, size, sha256, quality_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const image of images) {
        statement.run(image.id, id, image.fileName, image.mimeType, image.size, image.sha256, JSON.stringify(image.quality));
      }
    });
    insert.immediate();
    return this.getReceipt(id)!;
  }

  getReceipt(id: string) {
    const row = this.db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as ReceiptRow | undefined;
    return row ? this.hydrateReceipt(row) : null;
  }

  listReceipts(includeArchived = false) {
    const rows = this.db.prepare(`
      SELECT * FROM receipts
      WHERE (? = 1 OR archived_at IS NULL)
      ORDER BY created_at DESC
    `).all(includeArchived ? 1 : 0) as ReceiptRow[];
    return rows.map((row) => this.hydrateReceipt(row));
  }

  findDuplicateBySha(hashes: string[]) {
    if (!hashes.length) return null;
    const placeholders = hashes.map(() => "?").join(",");
    const row = this.db.prepare(`
      SELECT r.* FROM receipts r
      JOIN receipt_images i ON i.receipt_id = r.id
      WHERE i.sha256 IN (${placeholders}) AND r.archived_at IS NULL
      ORDER BY r.created_at DESC LIMIT 1
    `).get(...hashes) as ReceiptRow | undefined;
    return row ? this.hydrateReceipt(row) : null;
  }

  updateReceipt(id: string, updates: Partial<{
    status: ReceiptStatus;
    store: string;
    visitedAt: string | null;
    orderNumber: string;
    surveyCode: string;
    currency: string;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    confidence: number;
    items: Receipt["items"];
    experience: Experience | null;
    feedback: string;
    scheduledAt: string | null;
    archivedAt: string | null;
    failureReason: string | null;
    classification: ReceiptClassification | null;
  }>) {
    const current = this.getReceipt(id);
    if (!current) return null;
    if (updates.status) assertTransition(current.status, updates.status);

    const fieldMap: Record<string, string> = {
      status: "status",
      store: "store",
      visitedAt: "visited_at",
      orderNumber: "order_number",
      surveyCode: "survey_code",
      currency: "currency",
      subtotal: "subtotal",
      tax: "tax",
      total: "total",
      confidence: "confidence",
      items: "items_json",
      experience: "experience_json",
      feedback: "feedback",
      scheduledAt: "scheduled_at",
      archivedAt: "archived_at",
      failureReason: "failure_reason",
      classification: "classification_json",
    };
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (!entries.length) return current;
    const values = entries.map(([key, value]) => key === "items" || key === "experience" || key === "classification" ? JSON.stringify(value) : value);
    const assignments = entries.map(([key]) => `${fieldMap[key]} = ?`);
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString(), id);
    this.db.prepare(`UPDATE receipts SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
    return this.getReceipt(id);
  }

  getImage(receiptId: string, imageId: string) {
    return this.db.prepare("SELECT * FROM receipt_images WHERE receipt_id = ? AND id = ?").get(receiptId, imageId) as ImageRow | undefined;
  }

  deleteReceipt(id: string) {
    const images = this.db.prepare("SELECT * FROM receipt_images WHERE receipt_id = ?").all(id) as ImageRow[];
    const result = this.db.prepare("DELETE FROM receipts WHERE id = ?").run(id);
    return { deleted: result.changes > 0, images };
  }

  listEmployees(query = "") {
    const pattern = `%${query.trim()}%`;
    return (this.db.prepare("SELECT * FROM employees WHERE name LIKE ? ORDER BY created_at DESC LIMIT 20").all(pattern) as EmployeeRow[]).map(this.hydrateEmployee);
  }

  createEmployee(employee: Employee) {
    this.db.prepare("INSERT INTO employees (id, name, role, created_at) VALUES (?, ?, ?, ?)").run(employee.id, employee.name, employee.role, employee.createdAt);
    return employee;
  }

  getEmployee(id: string) {
    const row = this.db.prepare("SELECT * FROM employees WHERE id = ?").get(id) as EmployeeRow | undefined;
    return row ? this.hydrateEmployee(row) : null;
  }

  recoverAutomationJobs() {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE automation_jobs
      SET status = 'failed', progress = 0, message = 'The local server restarted before the survey could finish. Run it again.', updated_at = ?, completed_at = ?
      WHERE status IN ('queued', 'running')
    `).run(now, now);
  }

  createAutomationJob(job: Pick<AutomationJob, "id" | "receiptId" | "status" | "progress" | "message" | "createdAt" | "updatedAt" | "dryRun">) {
    this.db.prepare(`
      INSERT INTO automation_jobs (id, receipt_id, status, progress, message, created_at, updated_at, dry_run)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job.id, job.receiptId, job.status, job.progress, job.message, job.createdAt, job.updatedAt, job.dryRun ? 1 : 0);
    return this.getAutomationJob(job.id)!;
  }

  getAutomationJob(id: string) {
    const row = this.db.prepare("SELECT * FROM automation_jobs WHERE id = ?").get(id) as AutomationJobRow | undefined;
    return row ? this.hydrateAutomationJob(row) : null;
  }

  getLatestAutomationJob(receiptId: string) {
    const row = this.db.prepare("SELECT * FROM automation_jobs WHERE receipt_id = ? ORDER BY created_at DESC LIMIT 1").get(receiptId) as AutomationJobRow | undefined;
    return row ? this.hydrateAutomationJob(row) : null;
  }

  getActiveAutomationJob(receiptId: string) {
    const row = this.db.prepare("SELECT * FROM automation_jobs WHERE receipt_id = ? AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1").get(receiptId) as AutomationJobRow | undefined;
    return row ? this.hydrateAutomationJob(row) : null;
  }

  updateAutomationJob(id: string, updates: Partial<Pick<AutomationJob, "status" | "progress" | "message" | "startedAt" | "completedAt" | "proof" | "transcript">>) {
    const fieldMap: Record<string, string> = { status: "status", progress: "progress", message: "message", startedAt: "started_at", completedAt: "completed_at", proof: "proof_file", transcript: "transcript_json" };
    const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (!entries.length) return this.getAutomationJob(id);
    const assignments = entries.map(([key]) => `${fieldMap[key]} = ?`);
    const values = entries.map(([key, value]) => key === "transcript" ? JSON.stringify(value) : value);
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString(), id);
    this.db.prepare(`UPDATE automation_jobs SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
    return this.getAutomationJob(id);
  }

  private hydrateReceipt(row: ReceiptRow): Receipt {
    const images = this.db.prepare("SELECT * FROM receipt_images WHERE receipt_id = ? ORDER BY rowid").all(row.id) as ImageRow[];
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      store: row.store,
      visitedAt: row.visited_at,
      orderNumber: row.order_number,
      surveyCode: row.survey_code,
      currency: row.currency,
      subtotal: row.subtotal,
      tax: row.tax,
      total: row.total,
      confidence: row.confidence,
      items: JSON.parse(row.items_json) as Receipt["items"],
      images: images.map((image) => ({
        id: image.id,
        receiptId: image.receipt_id,
        fileName: image.file_name,
        mimeType: image.mime_type,
        size: image.size,
        sha256: image.sha256,
        quality: JSON.parse(image.quality_json) as QualityAssessment,
      })),
      experience: row.experience_json ? JSON.parse(row.experience_json) as Experience : null,
      feedback: row.feedback,
      scheduledAt: row.scheduled_at,
      archivedAt: row.archived_at,
      failureReason: row.failure_reason,
      classification: row.classification_json ? JSON.parse(row.classification_json) as ReceiptClassification : null,
    };
  }

  private hydrateEmployee(row: EmployeeRow): Employee {
    return { id: row.id, name: row.name, role: row.role, createdAt: row.created_at };
  }

  private hydrateAutomationJob(row: AutomationJobRow): AutomationJob {
    return {
      id: row.id,
      receiptId: row.receipt_id,
      status: row.status,
      progress: row.progress,
      message: row.message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      dryRun: row.dry_run === 1,
      proof: row.proof_file,
      transcript: row.transcript_json ? (JSON.parse(row.transcript_json) as SurveyPageSummary[]) : [],
    };
  }

  /** Every screenshot a receipt's runs produced, so deletion can clean them up. */
  listAutomationProofs(receiptId: string) {
    const rows = this.db.prepare("SELECT proof_file, transcript_json FROM automation_jobs WHERE receipt_id = ?").all(receiptId) as Array<{ proof_file: string | null; transcript_json: string | null }>;
    const files: string[] = [];
    for (const row of rows) {
      if (row.proof_file) files.push(row.proof_file);
      if (row.transcript_json) {
        for (const page of JSON.parse(row.transcript_json) as SurveyPageSummary[]) {
          if (page.screenshot) files.push(page.screenshot);
        }
      }
    }
    return files;
  }

  findAutomationProof(jobId: string, fileName: string) {
    const job = this.getAutomationJob(jobId);
    if (!job) return null;
    const allowed = new Set([job.proof, ...job.transcript.map((page) => page.screenshot)].filter((entry): entry is string => Boolean(entry)));
    return allowed.has(fileName) ? fileName : null;
  }
}
