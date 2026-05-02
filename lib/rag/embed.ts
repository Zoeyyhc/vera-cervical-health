import { EMBEDDING_MODEL, getOpenAIClient } from "@/lib/ai/openai";

/**
 * Embed a single text string and return its 1536-dim vector. Wraps the
 * OpenAI SDK so callers under `lib/rag/` don't depend on the SDK's response
 * shape — easier to swap providers (Voyage, Cohere) later if needed.
 *
 * Errors from the SDK propagate; retries are handled by the SDK's defaults
 * for v1.
 */
export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}
