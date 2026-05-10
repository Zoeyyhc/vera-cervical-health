import { CLAUDE_MODEL } from "@/lib/ai/anthropic";
import { loggedMessagesCreate } from "@/lib/ai/logged-anthropic";
import { CLASSIFIER_PROMPT } from "@/lib/ai/prompts";
import type { Intent } from "@/types/agents";

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
    const response = await loggedMessagesCreate(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16,
        temperature: 0,
        system: CLASSIFIER_PROMPT.text,
        messages: [{ role: "user", content: userMessage }],
      },
      { agent: "classifier", prompt: CLASSIFIER_PROMPT },
    );

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
  // handles it the same way the dispatch does below.
  return "general_chat";
}

import { runEventsAgent } from "@/lib/agents/events-agent";
import { runNewsAgent } from "@/lib/agents/news-agent";
import { runRagAgent } from "@/lib/agents/rag-agent";
import { type AgentChunk, runResponseAgent } from "@/lib/agents/response-agent";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const NEWS_EMPTY_FALLBACK =
  "I couldn't find any recent health news right now. Try again in a bit, or ask me about cervical health topics directly.";
const EVENTS_NEEDS_LOCATION_FALLBACK =
  "Which city are you in? I can look up cervical health events near you.";
const EVENTS_EMPTY_FALLBACK =
  "I couldn't find any upcoming health events for that location right now. Try a nearby city, or check back later.";

export type OrchestratorContext = {
  /** The new user turn. Same shape as the response agent's ctx. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /**
   * Optional `profiles.locale` for the signed-in user. Currently only used by
   * the events agent as a location hint; the orchestrator threads it through
   * but does not require it.
   */
  locale?: string | null;
};

/**
 * Multi-agent orchestrator. Classifies the user's intent and dispatches:
 *
 * - `health_question` → `runRagAgent` → `runResponseAgent` (with grounding fields)
 * - `news_request`    → `runNewsAgent` → `runResponseAgent` (or static fallback when empty)
 * - `events_request`  → `runEventsAgent` → `runResponseAgent` (or static fallback when empty / needsLocation)
 * - `general_chat`    → `runResponseAgent` directly
 *
 * Returns an `AsyncIterable<AgentChunk>` with the same wire shape as
 * `runResponseAgent` so the route doesn't need to know about dispatch.
 *
 * Per CLAUDE.md: agents don't call each other directly — the orchestrator
 * coordinates. Takes the auth-bound Supabase client (used by RAG); the route
 * still owns the connection.
 */
export async function* runOrchestrator(
  supabase: SupabaseClient<Database>,
  ctx: OrchestratorContext
): AsyncIterable<AgentChunk> {
  const { intent } = await classifyIntent(ctx.userMessage);
  console.info(`[orchestrator] dispatch: ${intent}`);

  if (intent === "health_question") {
    const { ragContext, ragSources } = await runRagAgent(supabase, {
      userMessage: ctx.userMessage,
    });
    if (ragSources.length === 0) {
      // Operational signal for tuning the 0.75 similarity threshold once the
      // KB grows past the seed. Truncate to 80 chars to keep PII risk low.
      console.info(
        `[orchestrator] health_question returned 0 chunks for query: ${ctx.userMessage.slice(0, 80)}`
      );
    }
    yield* runResponseAgent({
      userMessage: ctx.userMessage,
      history: ctx.history,
      groundingContext: ragContext,
      groundingSources: ragSources,
    });
    return;
  }

  if (intent === "news_request") {
    const { newsContext, newsSources } = await runNewsAgent({ userMessage: ctx.userMessage });
    if (newsSources.length === 0) {
      yield { type: "text", text: NEWS_EMPTY_FALLBACK };
      return;
    }
    yield* runResponseAgent({
      userMessage: ctx.userMessage,
      history: ctx.history,
      groundingContext: `Recent news (last 7 days):\n${newsContext}`,
      groundingSources: newsSources,
    });
    return;
  }

  if (intent === "events_request") {
    const { eventsContext, eventsSources, needsLocation } = await runEventsAgent({
      userMessage: ctx.userMessage,
      locale: ctx.locale,
    });
    if (needsLocation) {
      yield { type: "text", text: EVENTS_NEEDS_LOCATION_FALLBACK };
      return;
    }
    if (eventsSources.length === 0) {
      yield { type: "text", text: EVENTS_EMPTY_FALLBACK };
      return;
    }
    yield* runResponseAgent({
      userMessage: ctx.userMessage,
      history: ctx.history,
      groundingContext: `Upcoming events:\n${eventsContext}`,
      groundingSources: eventsSources,
    });
    return;
  }

  // general_chat (default)
  yield* runResponseAgent({
    userMessage: ctx.userMessage,
    history: ctx.history,
  });
}
