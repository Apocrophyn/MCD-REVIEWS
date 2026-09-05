import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  DATA_DIR: z.string().min(1).default(".data"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(10),
  MAX_IMAGES_PER_RECEIPT: z.coerce.number().int().min(1).max(5).default(3),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  ANTHROPIC_MODEL: z.string().trim().min(1).default("claude-sonnet-5"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(overrides: Partial<Record<keyof z.input<typeof envSchema>, unknown>> = {}) {
  const parsed = envSchema.parse({ ...process.env, ...overrides });
  const dataDir = path.resolve(parsed.DATA_DIR);

  // A credential is no longer required at boot: the Settings screen can supply
  // one at runtime, and every AI action fails loudly when none is configured.

  return {
    ...parsed,
    ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY || undefined,
    dataDir,
    uploadDir: path.join(dataDir, "uploads"),
    proofDir: path.join(dataDir, "survey-proofs"),
    settingsKeyPath: path.join(dataDir, "settings.key"),
    databasePath: path.join(dataDir, "receipt-relay.sqlite"),
    maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
  };
}
