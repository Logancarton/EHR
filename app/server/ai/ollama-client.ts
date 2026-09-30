/**
 * Lightweight, zero-dependency client for local Ollama instances.
 * Adheres to Clinical Bond D-107 zero-spend requirements: runs on-device,
 * no external network calls, no cloud API tokens.
 */

export interface OllamaClientConfig {
  baseUrl?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatOptions {
  model?: string;
  format?: "json" | Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
}

export interface OllamaGenerateOptions {
  model?: string;
  system?: string;
  format?: "json" | Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
}

export interface OllamaModelDetail {
  name: string;
  model: string;
  size: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export class OllamaError extends Error {
  readonly code: "UNAVAILABLE" | "TIMEOUT" | "INVALID_RESPONSE" | "EXECUTION_FAILED";
  override readonly cause?: unknown;

  constructor(
    message: string,
    code: "UNAVAILABLE" | "TIMEOUT" | "INVALID_RESPONSE" | "EXECUTION_FAILED",
    cause?: unknown,
  ) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
    this.cause = cause;
  }
}

function normalizedModelName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Ollama reports tagged model names such as `llama3.2:1b` or `qwen3:latest`.
 * A configured untagged name is allowed to resolve only to its `:latest` tag;
 * otherwise readiness must match exactly so the UI never claims a different local
 * model is ready merely because the Ollama daemon itself is running.
 */
export function ollamaModelMatches(configuredModel: string, installedModel: string): boolean {
  const configured = normalizedModelName(configuredModel);
  const installed = normalizedModelName(installedModel);
  if (!configured || !installed) return false;
  if (configured === installed) return true;
  return !configured.includes(":") && installed === `${configured}:latest`;
}

export class OllamaClient {
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly defaultTimeoutMs: number;

  constructor(config?: OllamaClientConfig) {
    this.baseUrl = (config?.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.defaultModel = config?.defaultModel || process.env.OLLAMA_MODEL || "llama3.2:1b";
    this.defaultTimeoutMs = config?.defaultTimeoutMs ?? 6000;
  }

  /** Fast non-throwing daemon availability check. This does not imply a model is installed. */
  async isServerAvailable(timeoutMs = 800): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Readiness check used by adaptive AI callers. A reachable Ollama daemon without
   * the configured model is not usable inference capacity, so it must return false
   * and allow the caller to take its explicit conservative fallback path.
   */
  async isAvailable(timeoutMs = 1200): Promise<boolean> {
    return this.isModelAvailable(this.defaultModel, timeoutMs);
  }

  /** True only when Ollama is reachable and the requested model is installed. */
  async isModelAvailable(model = this.defaultModel, timeoutMs = 1200): Promise<boolean> {
    try {
      const models = await this.listModels(timeoutMs);
      return models.some((detail) =>
        ollamaModelMatches(model, detail.name) || ollamaModelMatches(model, detail.model)
      );
    } catch {
      return false;
    }
  }

  /**
   * List models available in the local Ollama instance.
   */
  async listModels(timeoutMs = 1500): Promise<OllamaModelDetail[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new OllamaError(`Failed to fetch models (${response.status})`, "EXECUTION_FAILED");
      }
      const data = await response.json() as { models?: OllamaModelDetail[] };
      return Array.isArray(data.models) ? data.models : [];
    } catch (err) {
      if (err instanceof OllamaError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new OllamaError("Ollama listModels timed out", "TIMEOUT", err);
      }
      throw new OllamaError("Ollama instance is unavailable", "UNAVAILABLE", err);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Run chat completion with structured format or string output.
   */
  async chat(
    messages: OllamaChatMessage[],
    options?: OllamaChatOptions,
  ): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const model = options?.model || this.defaultModel;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.1,
        },
      };

      if (options?.format) {
        body.format = options.format;
      }

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new OllamaError(`Ollama chat returned HTTP ${response.status}: ${text}`, "EXECUTION_FAILED");
      }

      const data = await response.json() as { message?: { content?: string } };
      const content = data.message?.content;
      if (typeof content !== "string") {
        throw new OllamaError("Ollama response missing message.content", "INVALID_RESPONSE");
      }

      return content;
    } catch (err) {
      if (err instanceof OllamaError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new OllamaError(`Ollama chat timed out after ${timeoutMs}ms`, "TIMEOUT", err);
      }
      throw new OllamaError("Ollama chat failed or server unreachable", "UNAVAILABLE", err);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Chat completion parsed as JSON.
   */
  async chatJson<T>(
    messages: OllamaChatMessage[],
    options?: OllamaChatOptions,
  ): Promise<T> {
    const format = options?.format ?? "json";
    const raw = await this.chat(messages, { ...options, format });
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      throw new OllamaError("Ollama output could not be parsed as JSON", "INVALID_RESPONSE", err);
    }
  }
}

export const defaultOllamaClient = new OllamaClient();
