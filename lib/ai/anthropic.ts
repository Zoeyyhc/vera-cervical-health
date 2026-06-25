import { env } from "@/lib/env";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Hard-coded per CLAUDE.md — never read from env. The user-facing response
 * agent uses this model, where answer quality (citation accuracy, the
 * no-diagnosis guardrail) matters most. Bumping requires a code change + PR
 * review.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-6" as const;

/**
 * Cheaper model for low-stakes, non-user-facing calls — intent classification
 * (16-token output) and the off-path discovery pipeline. ~3× cheaper than
 * CLAUDE_MODEL; quality bar is low enough for these that Haiku is fine. Also
 * hard-coded, never from env.
 */
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5" as const;

/**
 * Returns a typed Anthropic SDK client. The API key is consumed from the
 * already-validated `env.anthropicApiKey` (see `lib/env.ts`) — module load
 * fails fast if the var is missing, so consumers don't need to null-check.
 */
export function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: env.anthropicApiKey });
}
