/**
 * The model providers a user can connect from the Settings screen.
 *
 * Everything except Anthropic speaks the OpenAI chat-completions dialect, so
 * one client covers OpenAI, DeepSeek, OpenRouter (Meta Llama and friends),
 * Groq, and any self-hosted or unlisted endpoint via `custom`.
 */

export type ProviderKind = "anthropic-api" | "anthropic-oauth" | "openai-compatible";

export interface ProviderDefinition {
  id: string;
  kind: ProviderKind;
  label: string;
  /** What the user pastes, in their words. */
  credentialLabel: string;
  credentialHint: string;
  /** Prefixes we can sanity-check before spending a request. */
  tokenPrefixes: string[];
  baseUrl: string;
  defaultModel: string;
  /** Models we know can read a receipt photo. */
  visionModels: string[];
  supportsVision: boolean;
  editableBaseUrl: boolean;
  notes: string;
  docsUrl: string;
}

export const providerCatalog: ProviderDefinition[] = [
  {
    id: "anthropic-api",
    kind: "anthropic-api",
    label: "Claude — Anthropic API key",
    credentialLabel: "Anthropic Console API key",
    credentialHint: "Starts with sk-ant-api…",
    tokenPrefixes: ["sk-ant-api"],
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    visionModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
    supportsVision: true,
    editableBaseUrl: false,
    notes: "Billed per token on your Anthropic Console account. Best receipt accuracy.",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "anthropic-oauth",
    kind: "anthropic-oauth",
    label: "Claude — Pro/Max subscription token",
    credentialLabel: "Claude subscription OAuth token",
    credentialHint: "Starts with sk-ant-oat…",
    tokenPrefixes: ["sk-ant-oat"],
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    visionModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
    supportsVision: true,
    editableBaseUrl: false,
    notes: "Generate this yourself with `claude setup-token` in the Claude Code CLI. It draws on your Claude subscription instead of Console billing, and usage counts against your plan limits.",
    docsUrl: "https://docs.claude.com/en/docs/claude-code/setup",
  },
  {
    id: "openai",
    kind: "openai-compatible",
    label: "OpenAI (ChatGPT API)",
    credentialLabel: "OpenAI API key",
    credentialHint: "Starts with sk-…",
    tokenPrefixes: ["sk-"],
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    visionModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
    supportsVision: true,
    editableBaseUrl: false,
    notes: "Needs a platform.openai.com API key. A ChatGPT Plus subscription is not an API key.",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "deepseek",
    kind: "openai-compatible",
    label: "DeepSeek",
    credentialLabel: "DeepSeek API key",
    credentialHint: "Starts with sk-…",
    tokenPrefixes: ["sk-"],
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    visionModels: [],
    supportsVision: false,
    editableBaseUrl: false,
    notes: "DeepSeek's chat models are text-only, so they can write feedback but cannot read a receipt photo. Pair it with a vision provider or type the receipt details in by hand.",
    docsUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "openrouter",
    kind: "openai-compatible",
    label: "OpenRouter (Meta Llama, and 300+ others)",
    credentialLabel: "OpenRouter API key",
    credentialHint: "Starts with sk-or-…",
    tokenPrefixes: ["sk-or-"],
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.2-90b-vision-instruct",
    visionModels: [
      "meta-llama/llama-3.2-90b-vision-instruct",
      "meta-llama/llama-3.2-11b-vision-instruct",
      "meta-llama/llama-4-maverick",
      "meta-llama/llama-4-scout",
    ],
    supportsVision: true,
    editableBaseUrl: false,
    notes: "The simplest route to Meta's Llama vision models. Any OpenRouter model id works — paste the exact id from their model list.",
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "groq",
    kind: "openai-compatible",
    label: "Groq (fast Llama hosting)",
    credentialLabel: "Groq API key",
    credentialHint: "Starts with gsk_…",
    tokenPrefixes: ["gsk_"],
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    visionModels: ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"],
    supportsVision: true,
    editableBaseUrl: false,
    notes: "Very fast Llama inference. Confirm the model id in the Groq console — their catalogue rotates often.",
    docsUrl: "https://console.groq.com/keys",
  },
  {
    id: "custom",
    kind: "openai-compatible",
    label: "Custom OpenAI-compatible endpoint",
    credentialLabel: "API key",
    credentialHint: "Whatever your endpoint expects as a bearer token",
    tokenPrefixes: [],
    baseUrl: "",
    defaultModel: "",
    visionModels: [],
    supportsVision: true,
    editableBaseUrl: true,
    notes: "Point this at Together, Fireworks, Ollama, vLLM, or anything else exposing /chat/completions. The endpoint must support tool calling.",
    docsUrl: "",
  },
];

export function findProvider(id: string) {
  return providerCatalog.find((provider) => provider.id === id) ?? null;
}

/** Vision capability is per-model, so an unknown model on a vision-capable host is allowed. */
export function modelSupportsVision(provider: ProviderDefinition, model: string) {
  if (!provider.supportsVision) return false;
  if (!provider.visionModels.length) return true;
  const normalized = model.trim().toLowerCase();
  if (provider.visionModels.some((candidate) => candidate.toLowerCase() === normalized)) return true;
  // Unlisted ids on a vision host are permitted, but obviously text-only
  // families are not, so the failure surfaces in Settings rather than mid-upload.
  return !/(embed|whisper|tts|moderation|rerank|deepseek-(chat|reasoner|coder))/.test(normalized);
}
