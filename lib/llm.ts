import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText as aiStreamText } from "ai";
import { logger } from "./logger";

/**
 * Provider-agnostic LLM client.
 *
 * Set LLM_PROVIDER to switch between providers:
 *   "anthropic" (default) — uses @ai-sdk/anthropic with Anthropic's native API
 *   "openai"              — uses @ai-sdk/openai with OpenAI's API
 *
 * Environment variables:
 *   LLM_PROVIDER  — "anthropic" | "openai" (default: "anthropic")
 *   LLM_API_KEY   — your API key for the chosen provider
 *   LLM_MODEL     — model identifier (e.g. claude-sonnet-4-20250514, gpt-4o)
 *   LLM_BASE_URL  — optional base URL override (useful for proxies)
 */

const provider = process.env.LLM_PROVIDER ?? "anthropic";
const apiKey = process.env.LLM_API_KEY ?? "";
const baseURL = process.env.LLM_BASE_URL;
const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES ?? "3", 10);
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS ?? "60000", 10); // 60s default

export const LLM_MODEL = process.env.LLM_MODEL ?? "claude-sonnet-4-20250514";

export function getLLM() {
  if (provider === "openai") {
    const openai = createOpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    return openai(LLM_MODEL);
  }

  const anthropic = createAnthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
  return anthropic(LLM_MODEL);
}

/**
 * Wrapper around Vercel AI SDK's streamText with built-in retry and timeout.
 * All agents should use this instead of importing streamText directly.
 *
 * - Retries up to MAX_RETRIES times on transient errors (429, 529, network)
 * - Aborts after LLM_TIMEOUT_MS (default 60s) to prevent hanging requests
 */
export function streamTextWithRetry(
  params: Parameters<typeof aiStreamText>[0],
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    logger.warn({ timeoutMs: LLM_TIMEOUT_MS }, "LLM request timed out");
  }, LLM_TIMEOUT_MS);

  const result = aiStreamText({
    ...params,
    maxRetries: MAX_RETRIES,
    abortSignal: controller.signal,
  });

  // Clear timeout when stream finishes (success or error)
  void Promise.resolve(result.text).finally(() => clearTimeout(timeout));

  return result;
}
