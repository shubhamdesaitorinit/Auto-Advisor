import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

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
