import { embed } from "ai";
import { getLLM } from "./llm";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Generate a vector embedding for the given text.
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions).
 * Falls back to Anthropic-compatible embedding if available.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  const apiKey = process.env.LLM_API_KEY ?? "";

  // OpenAI embeddings are the standard — use them if an OpenAI key is available
  const embeddingApiKey = process.env.OPENAI_API_KEY ?? apiKey;
  const embeddingBaseUrl = process.env.EMBEDDING_BASE_URL;

  const openai = createOpenAI({
    apiKey: embeddingApiKey,
    ...(embeddingBaseUrl ? { baseURL: embeddingBaseUrl } : {}),
  });

  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });

  return embedding;
}
