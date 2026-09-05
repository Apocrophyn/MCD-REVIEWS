import type { GroundingFacts } from "../domain/grounding.js";
import { feedbackResultSchema, type FeedbackResult, type ReceiptAnalysis } from "../domain/schemas.js";
import {
  FEEDBACK_TOOL_NAME,
  RECEIPT_TOOL_NAME,
  feedbackSystemPrompt,
  feedbackToolDescription,
  feedbackToolSchema,
  feedbackUserPrompt,
  parseReceiptToolResult,
  receiptInstruction,
  receiptToolDescription,
  receiptToolSchema,
} from "./contract.js";
import type { AIProvider, ReceiptImageInput } from "./provider.js";

interface ChatToolCall {
  function?: { name?: string; arguments?: string };
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatToolCall[] } }>;
  error?: { message?: string };
}

export interface OpenAICompatibleOptions {
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsVision: boolean;
  /** OpenRouter asks callers to identify themselves; harmless elsewhere. */
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.name = options.label;
  }

  async analyzeReceipt(images: ReceiptImageInput[]): Promise<ReceiptAnalysis> {
    if (!this.options.supportsVision) {
      throw new Error(`${this.options.label} cannot read images, so it cannot classify a receipt photo. Choose a vision-capable model in Settings, or enter the receipt details manually.`);
    }
    const content = [
      ...images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` },
      })),
      { type: "text" as const, text: receiptInstruction },
    ];
    const raw = await this.callTool(
      [{ role: "user", content }],
      { name: RECEIPT_TOOL_NAME, description: receiptToolDescription, parameters: receiptToolSchema },
      2_048,
    );
    return parseReceiptToolResult(raw);
  }

  async generateFeedback(facts: GroundingFacts): Promise<FeedbackResult> {
    const raw = await this.callTool(
      [
        { role: "system", content: feedbackSystemPrompt },
        { role: "user", content: feedbackUserPrompt(facts) },
      ],
      { name: FEEDBACK_TOOL_NAME, description: feedbackToolDescription, parameters: feedbackToolSchema },
      800,
    );
    return feedbackResultSchema.parse(raw);
  }

  private async callTool(messages: unknown[], tool: { name: string; description: string; parameters: unknown }, maxTokens: number) {
    const response = await withTransientRetry(async () => {
      const result = await fetch(`${trimSlash(this.options.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
          ...this.options.extraHeaders,
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: maxTokens,
          messages,
          tools: [{ type: "function", function: tool }],
          tool_choice: { type: "function", function: { name: tool.name } },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!result.ok) {
        const body = (await result.json().catch(() => null)) as ChatResponse | null;
        throw new UpstreamError(result.status, body?.error?.message || `${this.options.label} returned HTTP ${result.status}`);
      }
      return (await result.json()) as ChatResponse;
    });

    const call = response.choices?.[0]?.message?.tool_calls?.find((entry) => entry.function?.name === tool.name)
      ?? response.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    if (!args) {
      throw new Error(`${this.options.label} did not return a structured ${tool.name} result. This usually means the selected model does not support tool calling.`);
    }
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      throw new Error(`${this.options.label} returned a malformed ${tool.name} payload.`);
    }
  }
}

export class UpstreamError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, "");

async function withTransientRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = error instanceof UpstreamError ? error.status : undefined;
      const transient = status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
      if (!transient || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
