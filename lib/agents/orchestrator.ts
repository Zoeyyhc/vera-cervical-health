import { CLAUDE_FAST_MODEL } from "@/lib/ai/anthropic";
import { loggedMessagesCreate } from "@/lib/ai/logged-anthropic";
import { CLASSIFIER_PROMPT } from "@/lib/ai/prompts";
import type { Intent } from "@/types/agents";

const VALID_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "health_question",
  "news_request",
  "events_request",
  "services_request",
  "general_chat",
  "injection_attempt",
]);

const NEWS_RE = /\b(news|latest|recent updates?|articles?|headlines?)\b/i;
const EVENTS_RE = /\b(events?|meetups?|conferences?|near me)\b/i;
// Checked before EVENTS_RE, because "clinic near me" should find a service, not
// an event. Only consulted when the classifier call itself fails.
const SERVICES_RE =
  /\b(where can i|where do i|how do i)\b.{0,40}\b(get|book|have|find)\b|\b(clinic|gp|doctor|practice|bulk[\s-]?bill\w*)\b.{0,30}\b(near|nearby|around|in)\b/i;
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
        model: CLAUDE_FAST_MODEL,
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
  if (SERVICES_RE.test(message)) return "services_request";
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
import {
  isVictorianTurn,
  runVictoriaEventsAgent,
  runVictoriaHealthAgent,
  runVictoriaServicesAgent,
} from "@/lib/agents/victoria-agent";
import { recordAbuseEvent } from "@/lib/ai/abuse";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import { GAP_THRESHOLD, recordRagGap } from "@/lib/ai/rag-gap";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const NEWS_EMPTY_FALLBACK =
  "I couldn't find any recent health news right now. Try again in a bit, or ask me about cervical health topics directly.";
export const EVENTS_NEEDS_LOCATION_FALLBACK =
  "Which city are you in? I can look up cervical health events near you.";
export const EVENTS_EMPTY_FALLBACK =
  "I couldn't find any upcoming health events for that location right now. Try a nearby city, or check back later.";
export const INJECTION_REFUSAL =
  "I can only help with cervical health education, and I can't follow instructions that change how I work. But I'm happy to answer questions about HPV, screening, vaccination, or related topics — what would you like to know?";
export const SERVICES_NEEDS_LOCATION_FALLBACK =
  "Which Victorian suburb or postcode are you in? I can point you at the official directories for cervical screening services there.";
// Spec §7: an out-of-Victoria request must get a clear explanation of the scope
// and the existing non-MCP path, not a silent nationwide fallback.
export const SERVICES_OUTSIDE_VICTORIA_FALLBACK =
  "My verified service directories only cover Victoria at the moment, so I can't look that area up reliably. You can still use the Clinics page to search for services near you, and Healthdirect's national service finder at healthdirect.gov.au covers the rest of Australia.";
export const SERVICES_EMPTY_FALLBACK =
  "I couldn't reach my verified Victorian service directories just now. In the meantime, the Clinics page can search for services near you, and your GP can also do a cervical screening test.";

/**
 * Assistant turns that leave the conversation inside a path awaiting a location.
 *
 * Asking for one is the obvious case, but so is every dead end: after "nothing
 * in Burwood East" or "that's outside Victoria", naming another suburb is a
 * retry of the same request, not a new topic. These are the full fallback sets
 * for each path, and they are disjoint, so a turn belongs to at most one.
 */
const EVENTS_LOCATION_CONTEXT: ReadonlySet<string> = new Set([
  EVENTS_NEEDS_LOCATION_FALLBACK,
  EVENTS_EMPTY_FALLBACK,
]);
const SERVICES_LOCATION_CONTEXT: ReadonlySet<string> = new Set([
  SERVICES_NEEDS_LOCATION_FALLBACK,
  SERVICES_OUTSIDE_VICTORIA_FALLBACK,
  SERVICES_EMPTY_FALLBACK,
]);

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
 * - `events_request`  → verified Victorian events (MCP) → `runEventsAgent` → `runResponseAgent`
 * - `services_request`→ `runVictoriaServicesAgent` (MCP) → `runResponseAgent` (or static fallback)
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

// Same idea for the services prompt, which asks for a "suburb or postcode" —
// so a bare 4-digit postcode ("3053") also counts as a location reply.
function looksLikeBareLocation(text: string): boolean {
  return looksLikeBareCity(text) || /^\d{4}$/.test(text.trim());
}

/**
 * Victorian screening-service directories, via the Trusted Health MCP.
 *
 * v0.1 returns approved deep links only — no provider records, no availability
 * claims (spec §5.2). When the MCP is unreachable the user is pointed at the
 * existing `/clinics` page rather than left with nothing.
 */
async function* dispatchServicesRequest(ctx: OrchestratorContext): AsyncIterable<AgentChunk> {
  const city = ctx.city ?? null;
  const { context, sources, needsLocation, outsideVictoria } = await runVictoriaServicesAgent({
    userMessage: ctx.userMessage,
    city,
  });

  if (needsLocation) {
    yield { type: "text", text: SERVICES_NEEDS_LOCATION_FALLBACK };
    return;
  }
  if (outsideVictoria) {
    yield { type: "text", text: SERVICES_OUTSIDE_VICTORIA_FALLBACK };
    return;
  }
  if (sources.length === 0) {
    yield { type: "text", text: SERVICES_EMPTY_FALLBACK };
    return;
  }

  yield* runResponseAgent({
    userMessage: ctx.userMessage,
    history: ctx.history,
    groundingContext: `Approved Victorian screening-service directories:\n${context}`,
    groundingSources: sources,
  });
}

async function* dispatchEventsRequest(
  ctx: OrchestratorContext,
  cityOverride: string | null = null
): AsyncIterable<AgentChunk> {
  // Verified Victorian events come first for a Victorian turn: they are
  // admin-approved and unexpired, where the general events tool is a live
  // third-party search. Falls through to the existing agent when the MCP has
  // nothing or is unavailable, so non-Victorian users are unaffected.
  const victorian = await runVictoriaEventsAgent({
    userMessage: ctx.userMessage,
    city: cityOverride ?? ctx.city ?? null,
  });
  if (victorian.sources.length > 0) {
    yield* runResponseAgent({
      userMessage: ctx.userMessage,
      history: ctx.history,
      groundingContext: `Verified upcoming Victorian events:\n${victorian.context}`,
      groundingSources: victorian.sources,
    });
    return;
  }

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
  // Location follow-up: the previous assistant turn left us inside the events
  // path waiting on a location, and the user replied with something that looks
  // like a bare place — a city name or a postcode. The classifier won't see this
  // as events_request (no events keywords) and the events agent's regex won't
  // extract a location from a bare word, so we bridge the state here and route
  // directly with the typed string as city.
  const lastAssistant = [...ctx.history].reverse().find((m) => m.role === "assistant");
  if (
    lastAssistant !== undefined &&
    EVENTS_LOCATION_CONTEXT.has(lastAssistant.content) &&
    looksLikeBareLocation(ctx.userMessage)
  ) {
    console.info("[orchestrator] dispatch: events_request (city follow-up)");
    yield* dispatchEventsRequest(ctx, ctx.userMessage.trim());
    return;
  }

  // Same bridge for the services path above.
  if (
    lastAssistant !== undefined &&
    SERVICES_LOCATION_CONTEXT.has(lastAssistant.content) &&
    looksLikeBareLocation(ctx.userMessage)
  ) {
    console.info("[orchestrator] dispatch: services_request (location follow-up)");
    yield* dispatchServicesRequest({ ...ctx, city: ctx.userMessage.trim() });
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
    const { ragContext, ragSources, topScore } = await runRagAgent(supabase, {
      userMessage: ctx.userMessage,
    });
    if (topScore < GAP_THRESHOLD) {
      // Coverage gap — feeds the knowledge discovery pipeline. topScore is 0
      // when nothing matched, so this also covers the zero-result case.
      await recordRagGap({ question: ctx.userMessage, topScore });
    }

    // For a Victorian turn, prefer the governed MCP result: same curated cache,
    // but restricted to allowlisted Australian/Victorian authorities and carrying
    // verification state and review dates (spec §7). Plain RAG remains the
    // fallback, so a non-Victorian user — or an unreachable MCP — is unaffected.
    let groundingContext = ragContext;
    let groundingSources = ragSources;
    if (isVictorianTurn({ userMessage: ctx.userMessage, city: ctx.city ?? null })) {
      const victorian = await runVictoriaHealthAgent({
        userMessage: ctx.userMessage,
        city: ctx.city ?? null,
      });
      if (victorian.sources.length > 0) {
        groundingContext = victorian.context;
        groundingSources = victorian.sources;
      }
    }

    yield* runResponseAgent({
      userMessage: ctx.userMessage,
      history: ctx.history,
      groundingContext,
      groundingSources,
    });
    return;
  }

  if (intent === "services_request") {
    yield* dispatchServicesRequest(ctx);
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
