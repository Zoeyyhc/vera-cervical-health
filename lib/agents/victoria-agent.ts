import {
  findVictoriaScreeningServicesViaMcp,
  listVictoriaVerifiedEventsViaMcp,
  searchVictoriaHealthInfoViaMcp,
} from "@/lib/mcp/client";
import { resolveVictoriaScope } from "@/lib/mcp/victoria";
import type { Source } from "@/types/agents";

/**
 * Victoria Trusted Health agent — the orchestrator's adapter over the private
 * MCP (docs/trusted-health-mcp-v0.1.md).
 *
 * It shapes MCP tool output into the same `{ context, sources }` envelope the
 * RAG, News, and Events agents return, so the response agent needs to know
 * nothing about the MCP. Like every agent here it is a pure function of its
 * context and owns no DB connection.
 *
 * Availability is never assumed: each entry point resolves to an empty result
 * when the MCP is unreachable, and the orchestrator falls back to the existing
 * RAG / events paths (spec §8).
 */

/** Location markers the naive extractor recognises, same spirit as events-agent. */
const LOCATION_HINT_RE =
  /\b(?:in|near|around|at|from)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*|\d{4})/;

/** Same markers, but keeping whatever follows so it can be tested word by word. */
const LOCATION_TAIL_RE = /\b(?:in|near|around|at|from)\s+(.+)/i;

/** Longest Victorian locality worth trying, in words ("glen waverley south"). */
const MAX_LOCALITY_WORDS = 3;

export type VictoriaAgentContext = {
  /** The new user turn. Used as the search query and for location extraction. */
  userMessage: string;
  /** City from the chat client (browser geolocation → reverse geocode). Preferred. */
  city?: string | null;
};

export type VictoriaAgentResult = {
  /** Numbered context block with `[1]`, `[2]` markers matching `sources`. */
  context: string;
  /** Citation chips. Empty when there was nothing to return. */
  sources: Source[];
  /**
   * Set when a location was resolved but sits outside Victoria. The orchestrator
   * uses it to explain the Victorian scope rather than showing a bare empty
   * result (spec §7).
   */
  outsideVictoria?: boolean;
  /** Set when no location could be resolved at all and the tool needs one. */
  needsLocation?: boolean;
};

const EMPTY: VictoriaAgentResult = { context: "", sources: [] };

/**
 * Resolve the turn's location and decide whether it is Victorian.
 * Precedence: caller-provided `city` (geolocation) → naive extraction from the
 * message → none.
 */
export function resolveTurnLocation(ctx: VictoriaAgentContext): string | null {
  const fromCity = ctx.city?.trim();
  if (fromCity) return fromCity;
  const match = ctx.userMessage.match(LOCATION_HINT_RE);
  if (match) return match[1].trim();
  return extractVictorianPhrase(ctx.userMessage);
}

/**
 * Second pass for the way people actually type: "screening in burwood east",
 * no capitals. A lowercase word carries none of the proper-noun signal the
 * capitalised pattern relies on, so "in the morning" would read as a place. The
 * allowlist supplies the missing signal — a lowercase candidate is only taken
 * when it resolves to a Victorian locality or postcode.
 *
 * Longest window first, so "burwood east" wins over the "burwood" inside it.
 */
function extractVictorianPhrase(userMessage: string): string | null {
  const tail = userMessage.match(LOCATION_TAIL_RE);
  if (!tail) return null;

  // Word-only tokens: "burwood east?" must not carry its question mark into the
  // lookup, and normalizeLocation would strip it a step too late.
  const words = tail[1].toLowerCase().match(/[a-z0-9]+/g);
  if (!words) return null;

  for (let n = Math.min(MAX_LOCALITY_WORDS, words.length); n >= 1; n--) {
    const candidate = words.slice(0, n).join(" ");
    if (resolveVictoriaScope(candidate).inVictoria) return candidate;
  }
  return null;
}

/** True when this turn is scoped to Victoria and the MCP may be consulted. */
export function isVictorianTurn(ctx: VictoriaAgentContext): boolean {
  const location = resolveTurnLocation(ctx);
  return location !== null && resolveVictoriaScope(location).inVictoria;
}

// ───── search_victoria_health_info ───────────────────────────────────────────

/**
 * Governed health information for a Victorian turn. Returns an empty result when
 * the MCP has no approved match or is unavailable — the orchestrator then uses
 * the ordinary RAG grounding instead, so the user still gets an answer.
 */
export async function runVictoriaHealthAgent(
  ctx: VictoriaAgentContext
): Promise<VictoriaAgentResult> {
  const output = await searchVictoriaHealthInfoViaMcp({ query: ctx.userMessage });
  if (!output || output.items.length === 0) return EMPTY;

  const sources: Source[] = output.items.map((item, i) => ({
    id: String(i + 1),
    title: item.sourceName,
    url: item.sourceUrl,
    chunkId: item.id,
  }));

  const context = output.items
    .map(
      (item, i) =>
        `[${i + 1}] (${item.sourceName}, ${verificationLabel(item.verification)}, reviewed ${asDate(item.reviewedAt)}) ${item.excerpt}`
    )
    .join("\n\n");

  return { context, sources };
}

// ───── find_victoria_screening_services ──────────────────────────────────────

/**
 * Directory deep links for a Victorian location. The confirmation notice is
 * carried into the context verbatim, because spec §5.2 requires the response to
 * include it — the model is told to relay it, not to paraphrase it away.
 */
export async function runVictoriaServicesAgent(
  ctx: VictoriaAgentContext
): Promise<VictoriaAgentResult> {
  const location = resolveTurnLocation(ctx);
  if (!location) return { ...EMPTY, needsLocation: true };
  if (!resolveVictoriaScope(location).inVictoria) return { ...EMPTY, outsideVictoria: true };

  const output = await findVictoriaScreeningServicesViaMcp({ location });
  if (!output) return EMPTY;
  if (output.noResultReason === "outside_victoria") return { ...EMPTY, outsideVictoria: true };
  if (output.directoryLinks.length === 0) return EMPTY;

  const sources: Source[] = output.directoryLinks.map((link, i) => ({
    id: String(i + 1),
    title: link.directoryName,
    url: link.searchUrl,
    chunkId: `vic-directory:${link.searchUrl}`,
  }));

  const context = output.directoryLinks
    .map(
      (link, i) =>
        `[${i + 1}] ${link.directoryName} — ${link.searchUrl}
This is a DIRECTORY LISTING, not a booking and not confirmation that any provider is available.
Tell the user, in your own words but without softening it: ${link.confirmationNotice}`
    )
    .join("\n\n");

  return { context, sources };
}

// ───── list_victoria_verified_events ─────────────────────────────────────────

/**
 * Verified, unexpired Victorian events. A location is optional — statewide and
 * online events have none — so this is only skipped when a resolved location is
 * outside Victoria.
 */
export async function runVictoriaEventsAgent(
  ctx: VictoriaAgentContext
): Promise<VictoriaAgentResult> {
  const location = resolveTurnLocation(ctx);
  if (location && !resolveVictoriaScope(location).inVictoria) {
    return { ...EMPTY, outsideVictoria: true };
  }

  const output = await listVictoriaVerifiedEventsViaMcp(location ? { location } : {});
  if (!output || output.events.length === 0) return EMPTY;

  const sources: Source[] = output.events.map((event, i) => ({
    id: String(i + 1),
    title: event.name,
    url: event.registrationUrl,
    chunkId: `vic-events:${event.id}`,
  }));

  const context = output.events
    .map(
      (event, i) =>
        `[${i + 1}] ${event.name} — ${asDateTime(event.startsAt)}${event.endsAt ? ` to ${asDateTime(event.endsAt)}` : ""}\n` +
        `Format: ${event.format.replace("_", "-")}. Location: ${event.locationLabel}. Organiser: ${event.organiser}.\n` +
        `Register: ${event.registrationUrl} — details: ${event.sourceUrl}`
    )
    .join("\n\n");

  return { context, sources };
}

// ───── formatting ────────────────────────────────────────────────────────────

function verificationLabel(verification: "official_source" | "clinical_nonprofit"): string {
  return verification === "official_source" ? "official health authority" : "clinical non-profit";
}

/** ISO timestamp → `YYYY-MM-DD`, or the input unchanged when it is not parseable. */
function asDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

/** ISO timestamp → a readable Melbourne-local date and time. */
function asDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
