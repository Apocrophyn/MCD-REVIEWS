import { AnthropicProvider } from "./anthropic-provider.js";
import { findProvider, modelSupportsVision, type ProviderDefinition } from "./catalog.js";
import { DisabledAIProvider } from "./disabled-provider.js";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
import type { AIProvider } from "./provider.js";
import type { StoredCredential } from "../settings.js";

export interface ResolvedProvider {
  provider: AIProvider;
  definition: ProviderDefinition | null;
  model: string;
  supportsVision: boolean;
  source: "settings" | "environment" | "none";
}

export function buildProvider(credential: StoredCredential): { provider: AIProvider; definition: ProviderDefinition; supportsVision: boolean } {
  const definition = findProvider(credential.providerId);
  if (!definition) throw new Error(`Unknown model provider: ${credential.providerId}`);
  const model = credential.model.trim() || definition.defaultModel;
  if (!model) throw new Error("Choose a model for this provider");
  const supportsVision = modelSupportsVision(definition, model);

  if (definition.kind === "anthropic-api" || definition.kind === "anthropic-oauth") {
    return {
      definition,
      supportsVision,
      provider: new AnthropicProvider(credential.token, model, definition.kind === "anthropic-oauth" ? "oauth" : "api-key", definition.kind === "anthropic-oauth" ? "Claude (subscription)" : "Claude"),
    };
  }

  const baseUrl = (definition.editableBaseUrl ? credential.baseUrl.trim() : definition.baseUrl) || definition.baseUrl;
  if (!baseUrl) throw new Error("This provider needs a base URL");
  return {
    definition,
    supportsVision,
    provider: new OpenAICompatibleProvider({
      label: definition.label,
      baseUrl,
      apiKey: credential.token,
      model,
      supportsVision,
      extraHeaders: definition.id === "openrouter"
        ? { "HTTP-Referer": "https://github.com/Apocrophyn/MCD-REVIEWS", "X-Title": "Receipt Relay" }
        : undefined,
    }),
  };
}

/**
 * Settings win over environment variables so a user can change providers
 * without touching .env or restarting the server.
 */
export function resolveProvider(credential: StoredCredential | null, env: { apiKey?: string; model: string }): ResolvedProvider {
  if (credential) {
    try {
      const built = buildProvider(credential);
      return { provider: built.provider, definition: built.definition, model: credential.model || built.definition.defaultModel, supportsVision: built.supportsVision, source: "settings" };
    } catch (error) {
      console.error(`[receipt-relay] Stored credential unusable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  if (env.apiKey) {
    return {
      provider: new AnthropicProvider(env.apiKey, env.model, "api-key"),
      definition: findProvider("anthropic-api"),
      model: env.model,
      supportsVision: true,
      source: "environment",
    };
  }
  return { provider: new DisabledAIProvider(), definition: null, model: "", supportsVision: false, source: "none" };
}

/** One cheap live call that proves the credential works before the user uploads anything. */
export async function verifyCredential(credential: StoredCredential) {
  const { provider, definition, supportsVision } = buildProvider(credential);
  await provider.generateFeedback({
    store: "Test Diner",
    itemNames: ["Coffee"],
    attributes: ["service"],
    satisfaction: 4,
    notes: "",
  });
  return {
    ok: true as const,
    provider: provider.name,
    model: credential.model.trim() || definition.defaultModel,
    supportsVision,
    warning: supportsVision ? null : `${definition.label} works for feedback writing, but this model cannot read receipt photos. Receipt analysis stays disabled until you pick a vision-capable model.`,
  };
}
