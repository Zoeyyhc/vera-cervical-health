import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import type { Intent } from "@/types/agents";

/**
 * Tight classifier prompt. Returns ONE of four labels and nothing else.
 * Kept short to minimize tokens — the cost of mis-classification is bounded
 * by the rule-based fallback below.
 */
const CLASSIFIER_SYSTEM_PROMPT = `You classify the user's message into exactly ONE of these categories. Return ONLY the category name (lowercase, with underscores), nothing else — no explanation, no punctuation.

Categories:
- health_question  : questions about cervical health, HPV, screening, vaccination, symptoms, treatments, anatomy
- news_request     : explicit requests for recent news, articles, headlines, or updates
- events_request   : questions about upcoming events, meetups, screening clinics, conferences, or local activity
- general_chat     : greetings, off-topic questions, or anything that doesn't fit above

If unsure, choose general_chat.`;

const VALID_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "health_question",
  "news_request",
  "events_request",
  "general_chat",
]);

const NEWS_RE = /\b(news|latest|recent updates?|articles?|headlines?)\b/i;
const EVENTS_RE = /\b(events?|meetups?|conferences?|near me)\b/i;

export type ClassifyResult = {
  intent: Intent;
  confidence?: number;
};

/**
 * Classify a user message. Always resolves with a valid `Intent` — on Claude
 * error or unparseable output, falls back to keyword rules with `general_chat`
 * as the safe default.
 */
export async function classifyIntent(userMessage: string): Promise<ClassifyResult> {
  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16,
      temperature: 0,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()
      .toLowerCase();

    if (VALID_INTENTS.has(raw as Intent)) {
      return { intent: raw as Intent };
    }
    // Model returned something we can't parse — fall through to keyword rules.
  } catch (err) {
    // Log server-side, then fall through. The classifier never throws.
    console.error(
      "[orchestrator] classifyIntent: Claude error, falling back to keyword rules:",
      err instanceof Error ? err.message : err
    );
  }

  return { intent: fallbackIntent(userMessage) };
}

function fallbackIntent(message: string): Intent {
  if (NEWS_RE.test(message)) return "news_request";
  if (EVENTS_RE.test(message)) return "events_request";
  // No keyword for health_question — too easy to over-fire on common health
  // terms in small-talk turns. Default to general_chat; the response agent
  // handles it the same way #27's dispatch will.
  return "general_chat";
}
