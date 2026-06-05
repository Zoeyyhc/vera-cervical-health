import { CLAUDE_MODEL } from "@/lib/ai/anthropic";
import { loggedMessagesCreate } from "@/lib/ai/logged-anthropic";
import { CLASSIFIER_PROMPT } from "@/lib/ai/prompts";
import type { Intent } from "@/types/agents";

const VALID_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "health_question",
  "news_request",
  "events_request",
  "general_chat",
  "injection_attempt",
]);

const NEWS_RE = /\b(news|latest|recent updates?|articles?|headlines?)\b/i;
const EVENTS_RE = /\b(events?|meetups?|conferences?|near me)\b/i;
// Heuristic backstop for jailbreak phrasing — only consulted when the
// classifier call itself fails (Claude error). Accepts misses; the classifier
// is the primary signal. Covers the highest-frequency English patterns.
const INJECTION_RE =
  /\b(ignore|disregard|forget)\b.{0,20}\b(all |the )?(previous|above|prior|earlier)\b.{0,20}\binstructions?\b|\byou are now\b|\bsystem prompt\b|\bpretend (you|to be)\b|\bact as (an?|the)\b/i;

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
      { agent: "classifier", prompt: CLASSIFIER_PROMPT }
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
  if (INJECTION_RE.test(message)) return "injection_attempt";
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
import { recordAbuseEvent } from "@/lib/ai/abuse";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const NEWS_EMPTY_FALLBACK =
  "I couldn't find any recent health news right now. Try again in a bit, or ask me about cervical health topics directly.";
export const EVENTS_NEEDS_LOCATION_FALLBACK =
  "Which city are you in? I can look up cervical health events near you.";
const EVENTS_EMPTY_FALLBACK =
  "I couldn't find any upcoming health events for that location right now. Try a nearby city, or check back later.";
export const INJECTION_REFUSAL =
  "I can only help with cervical health education, and I can't follow instructions that change how I work. But I'm happy to answer questions about HPV, screening, vaccination, or related topics — what would you like to know?";

export type OrchestratorContext = {
  /** The new user turn. Same shape as the response agent's ctx. */
  userMessage: string;
  /** Prior conversation, oldest first. Does NOT include `userMessage`. */
  history: ChatHistoryMessage[];
  /**
   * Optional city name (resolved client-side via browser geolocation +
   * reverse geocoding). Currently only used by the events agent as a location
   * hint; the orchestrator threads it through but does not require it.
   */
  city?: string | null;
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
// Looks like the user is replying with just a city name (e.g. "melbourne",
// "New York", "Saint Petersburg"). Used to detect follow-up to the "Which
// city are you in?" prompt — the classifier won't catch a bare city as
// events_request. Strict: short, letters/spaces/hyphens only, at most 3 tokens.
function looksLikeBareCity(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  if (!/^[A-Za-z][A-Za-z\s-]*$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 3;
}

async function* dispatchEventsRequest(
  ctx: OrchestratorContext,
  cityOverride: string | null = null
): AsyncIterable<AgentChunk> {
  const { eventsContext, eventsSources, needsLocation } = await runEventsAgent({
    userMessage: ctx.userMessage,
    city: cityOverride ?? ctx.city ?? null,
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
}

export async function* runOrchestrator(
  supabase: SupabaseClient<Database>,
  ctx: OrchestratorContext
): AsyncIterable<AgentChunk> {
  // City follow-up: the previous assistant turn was our "Which city?" prompt
  // and the user replied with something that looks like a bare city name. The
  // classifier won't see this as events_request (no events keywords) and the
  // events agent's regex won't extract a location from a bare word, so we
  // bridge the state here and route directly with the typed string as city.
  const lastAssistant = [...ctx.history].reverse().find((m) => m.role === "assistant");
  if (
    lastAssistant?.content === EVENTS_NEEDS_LOCATION_FALLBACK &&
    looksLikeBareCity(ctx.userMessage)
  ) {
    console.info("[orchestrator] dispatch: events_request (city follow-up)");
    yield* dispatchEventsRequest(ctx, ctx.userMessage.trim());
    return;
  }

  const { intent } = await classifyIntent(ctx.userMessage);
  console.info(`[orchestrator] dispatch: ${intent}`);

  if (intent === "injection_attempt") {
    await recordAbuseEvent({ type: "injection_attempt", messageExcerpt: ctx.userMessage });
    yield { type: "text", text: INJECTION_REFUSAL };
    return;
  }

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
    yield* dispatchEventsRequest(ctx);
    return;
  }

  // general_chat (default)
  yield* runResponseAgent({
    userMessage: ctx.userMessage,
    history: ctx.history,
  });
}
