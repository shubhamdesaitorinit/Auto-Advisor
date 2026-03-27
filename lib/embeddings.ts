import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Generate a vector embedding for the given text.
 * Uses Google's gemini-embedding-001 model (768 dimensions).
 * Free tier with generous limits from Google AI Studio.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: text,
  });

  return embedding;
}
