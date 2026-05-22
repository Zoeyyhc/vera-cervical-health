import { findHealthEvents } from "@/lib/tools/events";
import type { HealthEvent } from "@/lib/validations/events";
import type { Source } from "@/types/agents";

const MAX_RESULTS = 5;

// Dumb v1 location extractor: pulls a Capitalized place after "in/near/around/at".
// Stops at end of string or sentence punctuation. Good enough for the common
// phrasings ("events in Sydney", "near Brisbane?"); intentionally not trying
// NER. The orchestrator can ask for clarification when this misses.
const LOCATION_HINT_RE = /\b(?:in|near|around|at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/;

export type EventsAgentContext = {
  /** The new user turn — also used as the search query and for location extraction. */
  userMessage: string;
  /** City name from the chat client (browser geolocation → reverse geocode). Preferred over location extracted from the message. */
  city?: string | null;
};

export type EventsAgentResult = {
  /**
   * Numbered concatenation of events with `[1]`, `[2]` markers matching
   * `eventsSources`. Empty string when no events were returned or the agent
   * could not resolve a location. Consumed by the response agent under an
   * "Upcoming events:" header.
   */
  eventsContext: string;
  /**
   * Citation chips. `chunkId` is `events:<url>` so the chip renderer dedupes
   * across turns even though events have no DB row.
   */
  eventsSources: Source[];
  /**
   * Set when the agent could not resolve a location at all. The orchestrator
   * uses this to swap in a "what city are you in?" follow-up rather than the
   * generic "no events found" line.
   */
  needsLocation?: boolean;
};

/**
 * Events agent — resolves a location, calls `findHealthEvents`, and shapes
 * results into the same `{ context, sources }` envelope the RAG and News
 * agents return so downstream code is uniform.
 *
 * Location precedence: caller-provided `city` (browser geolocation) →
 * naive extraction from `userMessage` → `needsLocation: true` (empty result).
 */
export async function runEventsAgent(ctx: EventsAgentContext): Promise<EventsAgentResult> {
  const location = resolveLocation(ctx);
  if (!location) {
    return { eventsContext: "", eventsSources: [], needsLocation: true };
  }

  let events: HealthEvent[] = [];
  try {
    events = await findHealthEvents({
      location,
      query: ctx.userMessage,
      max_results: MAX_RESULTS,
    });
  } catch (err) {
    console.error(
      "[events-agent] findHealthEvents unexpectedly threw:",
      err instanceof Error ? err.message : err
    );
    return { eventsContext: "", eventsSources: [] };
  }

  if (events.length === 0) {
    return { eventsContext: "", eventsSources: [] };
  }

  const eventsSources: Source[] = events.map((e, i) => ({
    id: String(i + 1),
    title: e.name,
    url: e.url,
    chunkId: `events:${e.url}`,
  }));
  const eventsContext = events.map((e, i) => formatEvent(e, i + 1)).join("\n\n");

  return { eventsContext, eventsSources };
}

function resolveLocation(ctx: EventsAgentContext): string | null {
  const fromCity = ctx.city?.trim();
  if (fromCity) return fromCity;
  const match = ctx.userMessage.match(LOCATION_HINT_RE);
  return match ? match[1].trim() : null;
}

function formatEvent(event: HealthEvent, marker: number): string {
  const head = `[${marker}] ${event.name} — ${event.date} (${event.location})`;
  return event.description ? `${head}\n${event.description}` : head;
}
