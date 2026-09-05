import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

/**
 * Local encrypted settings.
 *
 * Credentials typed into the Settings screen are stored on the local server,
 * never in the browser bundle and never returned to the client in plaintext.
 * They are sealed with AES-256-GCM under a key file that only the local user
 * can read, so a stray copy of the SQLite file does not leak a working token.
 */

const ALGORITHM = "aes-256-gcm";

export interface StoredCredential {
  providerId: string;
  model: string;
  baseUrl: string;
  token: string;
  updatedAt: string;
}

export class SettingsStore {
  private readonly key: Buffer;

  constructor(private readonly db: Database.Database, keyPath: string) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.key = readOrCreateKey(keyPath);
  }

  private seal(plaintext: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), sealed.toString("base64")].join(".");
  }

  private open(sealed: string) {
    const [iv, tag, payload] = sealed.split(".");
    if (!iv || !tag || !payload) throw new Error("Stored credential is malformed");
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
  }

  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(this.open(row.value)) as T;
    } catch {
      // A rotated or corrupted key file must not brick the app; the user can
      // simply re-enter the credential.
      this.delete(key);
      return null;
    }
  }

  set(key: string, value: unknown) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, this.seal(JSON.stringify(value)), now);
  }

  delete(key: string) {
    this.db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
  }

  getCredential() {
    return this.get<StoredCredential>("ai_credential");
  }

  setCredential(credential: StoredCredential) {
    this.set("ai_credential", credential);
  }

  clearCredential() {
    this.delete("ai_credential");
  }

  getAutomationPreferences() {
    return this.get<{ showBrowser: boolean }>("automation_preferences") ?? { showBrowser: false };
  }

  setAutomationPreferences(preferences: { showBrowser: boolean }) {
    this.set("automation_preferences", preferences);
  }
}

function readOrCreateKey(keyPath: string) {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  if (fs.existsSync(keyPath)) {
    const existing = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
    if (existing.length === 32) return existing;
  }
  const key = randomBytes(32);
  fs.writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
}

/** Shows enough of a token to recognise it without being usable if screenshotted. */
export function maskToken(token: string) {
  if (token.length <= 12) return "•".repeat(token.length);
  return `${token.slice(0, 8)}${"•".repeat(10)}${token.slice(-4)}`;
}
