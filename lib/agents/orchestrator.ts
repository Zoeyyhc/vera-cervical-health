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
import { type EventsScope, detectEventsScope } from "@/lib/agents/events-scope";
import {
  type GeoFix,
  type LocationResolution,
  extractLocationPhrase,
  resolveLocation,
  resolveLocationPhrase,
} from "@/lib/agents/location";
import { runNewsAgent } from "@/lib/agents/news-agent";
import { runRagAgent } from "@/lib/agents/rag-agent";
import { type AgentChunk, runResponseAgent } from "@/lib/agents/response-agent";
import {
  runVictoriaEventsAgent,
  runVictoriaHealthAgent,
  runVictoriaServicesAgent,
} from "@/lib/agents/victoria-agent";
import { recordAbuseEvent } from "@/lib/ai/abuse";
import type { ChatHistoryMessage } from "@/lib/ai/context-window";
import type { PendingAction } from "@/lib/ai/pending-action";
import { GAP_THRESHOLD, recordRagGap } from "@/lib/ai/rag-gap";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const NEWS_EMPTY_FALLBACK =
  "I couldn't find any recent health news right now. Try again in a bit, or ask me about cervical health topics directly.";
export const EVENTS_NEEDS_LOCATION_FALLBACK =
  "Which suburb and state are you in — or what's your postcode? I can look up cervical health events near you once I know where to search.";
export const EVENTS_EMPTY_FALLBACK =
  "I couldn't find any upcoming health events for that location right now. Try a nearby suburb, or check back later.";
/**
 * Spec §7, matching the services path: an out-of-Victoria request gets the scope
 * explained, not a bare empty result. Saying "I couldn't find any events" to a
 * Sydney user describes a search that was never run for them.
 *
 * Deliberately claims nothing about what any organisation currently has on. The
 * verified events table holds only hand-reviewed Victorian entries, so the
 * honest offer elsewhere is national services and information, not listings.
 */
export const EVENTS_OUTSIDE_VICTORIA_FALLBACK =
  "The events I can vouch for are reviewed by hand and only cover Victoria at the moment, so I can't tell you what's on in your area. For the rest of Australia, Healthdirect's national service finder at healthdirect.gov.au lists health services near you, Cancer Council's 13 11 20 line can point you to what's running in your state, and Jean Hailes at jeanhailes.org.au publishes cervical health information nationally. Your GP can also do a cervical screening test.";
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

/** Full state names, so a clarifying question can read like a sentence. */
const STATE_NAMES: ReadonlyMap<string, string> = new Map([
  ["VIC", "Victoria"],
  ["NSW", "New South Wales"],
  ["QLD", "Queensland"],
  ["SA", "South Australia"],
  ["WA", "Western Australia"],
  ["TAS", "Tasmania"],
  ["NT", "the Northern Territory"],
  ["ACT", "the ACT"],
]);

/**
 * Ask which state a shared suburb name refers to, naming the candidates.
 *
 * 457 Victorian locality names are also used by another state, so this is the
 * common case rather than an edge one. Naming them beats a vague "which state?":
 * the user learns why they are being asked.
 */
export function ambiguousLocationFallback(
  locality: string,
  candidateStates: readonly string[],
  what: "events" | "services"
): string {
  const names = candidateStates.map((s) => STATE_NAMES.get(s) ?? s);
  const listed =
    names.length <= 1
      ? (names[0] ?? "more than one state")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const subject = what === "events" ? "look for events" : "find services";
  return `There's a ${titleCase(locality)} in ${listed}, and I don't want to guess which one you mean — the ${what} I'd point you at are Victorian. Which state, or what's the postcode? I'll ${subject} there.`;
}

function titleCase(locality: string): string {
  return locality.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Assistant turns that left the conversation awaiting a location, for sessions
 * whose assistant message predates `pendingAction` metadata.
 *
 * Transitional: `pendingAction` on the message is the real state, and is what
 * new turns write. This keeps a conversation that was mid-retry across the
 * deploy from dead-ending, and can be deleted once no live session predates it.
 * Note that the parameterised ambiguity prompt is deliberately absent — it never
 * existed before this change, so nothing in history can match it.
 */
const LEGACY_EVENTS_LOCATION_CONTEXT: ReadonlySet<string> = new Set([
  EVENTS_NEEDS_LOCATION_FALLBACK,
  EVENTS_EMPTY_FALLBACK,
]);
const LEGACY_SERVICES_LOCATION_CONTEXT: ReadonlySet<string> = new Set([
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
   * Structured browser fix (geolocation → `/api/geocode/reverse`). Carries the
   * state, which a bare city name did not — and without a state a shared suburb
   * name confirms nothing.
   */
  geo?: GeoFix | null;
  /**
   * The client already tried browser geolocation for this turn and came back
   * empty — denied, timed out, unsupported, or the reverse geocode failed.
   * Distinguishes "ask the user to type a suburb" from "ask the browser first",
   * so a denied permission is never reported as "no events found".
   */
  geolocationAttempted?: boolean;
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
/**
 * Read a reply to "where are you?" as a location, or return `null` when it is
 * really a change of subject.
 *
 * Two shapes, because people answer both ways. A bare "Burwood 3125" or "VIC" is
 * the whole message, and is classified directly. But "I am in burwood east,
 * 3151." is just as common a reply, and counting tokens cannot tell it from
 * "actually, tell me about HPV instead" — both are six words. So the sentence
 * form is settled by whether a location can be pulled out of it at all, which is
 * a question about meaning rather than length.
 */
function locationReplyResolution(message: string, geo: GeoFix | null): LocationResolution | null {
  if (looksLikeBareReply(message)) {
    const resolved = resolveLocationPhrase(message, geo);
    // "unknown" here means the bare reply named nothing we recognise, so it is
    // more likely a new topic than a location — let the classifier have it.
    if (resolved.status !== "unknown" && resolved.status !== "missing") return resolved;
  }

  const phrase = extractLocationPhrase(message);
  return phrase === null ? null : resolveLocationPhrase(phrase, geo);
}

/** A message that is nothing but a place: "Burwood", "burwood vic", "3151". */
function looksLikeBareReply(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9\s,.'-]*$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 4;
}

/** The location string to hand a tool, once the resolution has confirmed it. */
function confirmedLocation(resolution: LocationResolution): string {
  if (resolution.status !== "confirmed_vic") return "";
  return resolution.postcode ?? resolution.locality;
}

/**
 * The pending action a turn left behind: the metadata it recorded, or — for
 * assistant turns written before that metadata existed — its text.
 */
function pendingActionFor(message: ChatHistoryMessage): PendingAction | null {
  if (message.pendingAction) return message.pendingAction;
  if (LEGACY_EVENTS_LOCATION_CONTEXT.has(message.content)) {
    return { kind: "find_events", awaiting: "location" };
  }
  if (LEGACY_SERVICES_LOCATION_CONTEXT.has(message.content)) {
    return { kind: "find_services", awaiting: "location" };
  }
  return null;
}

/**
 * The scope to resume a location follow-up with. A "near me" question that has
 * just been given a suburb is no longer about the browser's idea of where the
 * user is, so it must not ask for geolocation again.
 */
function resumeScope(scope: EventsScope | undefined): EventsScope {
  return scope === "statewide" ? "statewide" : "specified_location";
}

/**
 * Victorian screening-service directories, via the Trusted Health MCP.
 *
 * v0.1 returns approved deep links only — no provider records, no availability
 * claims (spec §5.2). When the MCP is unreachable the user is pointed at the
 * existing `/clinics` page rather than left with nothing.
 */
async function* dispatchServicesRequest(
  ctx: OrchestratorContext,
  override?: LocationResolution
): AsyncIterable<AgentChunk> {
  const resolution =
    override ?? resolveLocation({ userMessage: ctx.userMessage, geo: ctx.geo ?? null });
  const awaitingLocation: PendingAction = { kind: "find_services", awaiting: "location" };

  if (resolution.status === "ambiguous") {
    yield {
      type: "text",
      text: ambiguousLocationFallback(resolution.locality, resolution.candidateStates, "services"),
    };
    yield { type: "pending_action", action: awaitingLocation };
    return;
  }
  if (resolution.status === "outside_vic") {
    // No pending action: asking for another suburb implies a different answer
    // is available, and it isn't.
    yield { type: "text", text: SERVICES_OUTSIDE_VICTORIA_FALLBACK };
    return;
  }
  if (resolution.status !== "confirmed_vic") {
    yield { type: "text", text: SERVICES_NEEDS_LOCATION_FALLBACK };
    yield { type: "pending_action", action: awaitingLocation };
    return;
  }

  const { context, sources, outsideVictoria } = await runVictoriaServicesAgent({
    userMessage: ctx.userMessage,
    location: confirmedLocation(resolution),
  });

  // The tool re-checks scope at the MCP boundary; honour a disagreement.
  if (outsideVictoria) {
    yield { type: "text", text: SERVICES_OUTSIDE_VICTORIA_FALLBACK };
    return;
  }
  if (sources.length === 0) {
    yield { type: "text", text: SERVICES_EMPTY_FALLBACK };
    yield { type: "pending_action", action: awaitingLocation };
    return;
  }

  yield* runResponseAgent({
    userMessage: ctx.userMessage,
    history: ctx.history,
    groundingContext: `Approved Victorian screening-service directories:\n${context}`,
    groundingSources: sources,
  });
}

/**
 * Events, routed by how wide the question is.
 *
 * Only a statewide question ("what's on in Victoria?") may be answered without
 * knowing where the user is. "Near me" and "in Burwood" are location-collection
 * flows: querying without a confirmed location and reporting the empty result
 * describes a search that was never scoped to them, which is what produced
 * "I don't have access to real-time event listings" for a bare postcode.
 */
async function* dispatchEventsRequest(
  ctx: OrchestratorContext,
  override?: { resolution: LocationResolution; scope?: EventsScope }
): AsyncIterable<AgentChunk> {
  const resolution =
    override?.resolution ?? resolveLocation({ userMessage: ctx.userMessage, geo: ctx.geo ?? null });
  const scope = override?.scope ?? detectEventsScope(ctx.userMessage, resolution);
  const pending = (geolocation?: boolean): PendingAction => ({
    kind: "find_events",
    awaiting: "location",
    scope,
    ...(geolocation ? { geolocation: true } : {}),
  });

  if (scope !== "statewide") {
    if (resolution.status === "ambiguous") {
      yield {
        type: "text",
        text: ambiguousLocationFallback(resolution.locality, resolution.candidateStates, "events"),
      };
      yield { type: "pending_action", action: pending() };
      return;
    }
    if (resolution.status === "outside_vic") {
      yield { type: "text", text: EVENTS_OUTSIDE_VICTORIA_FALLBACK };
      return;
    }
    if (resolution.status !== "confirmed_vic") {
      // A "near me" turn gets one shot at the browser before we make the user
      // type anything — the permission prompt is then attached to their own
      // request, which is both better UX and what browsers expect.
      if (scope === "nearby" && !ctx.geolocationAttempted) {
        yield { type: "pending_action", action: pending(true) };
        return;
      }
      yield { type: "text", text: EVENTS_NEEDS_LOCATION_FALLBACK };
      yield { type: "pending_action", action: pending() };
      return;
    }
  }

  // Verified Victorian events come first: they are admin-approved and unexpired,
  // where the general events tool is a live third-party search. A statewide
  // question passes no location, which is what the MCP wants for one.
  const location = scope === "statewide" ? undefined : confirmedLocation(resolution);
  const victorian = await runVictoriaEventsAgent({
    userMessage: ctx.userMessage,
    ...(location ? { location } : {}),
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

  // Nothing verified. The general events search is a genuine second look for a
  // location we have confirmed, so an empty answer from it is a real "nothing
  // found" rather than a scope failure dressed up as one.
  const { eventsContext, eventsSources } = await runEventsAgent({
    userMessage: ctx.userMessage,
    city: location ?? "Victoria",
  });
  if (eventsSources.length === 0) {
    yield { type: "text", text: EVENTS_EMPTY_FALLBACK };
    yield { type: "pending_action", action: pending() };
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
  // Location follow-up. The previous assistant turn asked where the user is and
  // recorded that on its own message, so a reply of "burwood vic" or "3151"
  // resumes the request it belongs to. The classifier can't see a bare place as
  // a request, and reading the location out of the message won't work either —
  // there is no "in"/"near" to anchor on — so the pending action is the only
  // thing that keeps the conversation on-path.
  const lastAssistant = [...ctx.history].reverse().find((m) => m.role === "assistant");
  const pending = lastAssistant ? pendingActionFor(lastAssistant) : null;
  const replyLocation = pending ? locationReplyResolution(ctx.userMessage, ctx.geo ?? null) : null;
  if (pending && replyLocation) {
    if (pending.kind === "find_events") {
      console.info("[orchestrator] dispatch: events_request (location follow-up)");
      yield* dispatchEventsRequest(ctx, {
        resolution: replyLocation,
        scope: resumeScope(pending.scope),
      });
    } else {
      console.info("[orchestrator] dispatch: services_request (location follow-up)");
      yield* dispatchServicesRequest(ctx, replyLocation);
    }
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
    const where = resolveLocation({ userMessage: ctx.userMessage, geo: ctx.geo ?? null });
    if (where.status === "confirmed_vic") {
      const victorian = await runVictoriaHealthAgent({ userMessage: ctx.userMessage });
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
