import { env } from "@/lib/env";
import OpenAI from "openai";

/**
 * Hard-coded per CLAUDE.md — never read from env. All embedding calls in
 * lib/rag/ use this exact model string. Bumping requires a code change + PR
 * review, and a re-embedding of the existing knowledge_chunks rows (the
 * 1536-dim vector column would need to match a new model's output shape).
 */
export const EMBEDDING_MODEL = "text-embedding-3-small" as const;

/**
 * Returns a typed OpenAI SDK client. The API key is consumed from the
 * already-validated `env.openaiApiKey` (see `lib/env.ts`) — module load
 * fails fast if the var is missing, so consumers don't need to null-check.
 */
export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: env.openaiApiKey });
}
