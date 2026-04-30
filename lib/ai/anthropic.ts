import { env } from "@/lib/env";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Hard-coded per CLAUDE.md — never read from env. All agent calls use this
 * exact model string. Bumping requires a code change + PR review.
 */
export const CLAUDE_MODEL = "claude-sonnet-4-6" as const;

/**
 * Returns a typed Anthropic SDK client. The API key is consumed from the
 * already-validated `env.anthropicApiKey` (see `lib/env.ts`) — module load
 * fails fast if the var is missing, so consumers don't need to null-check.
 */
export function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: env.anthropicApiKey });
}
