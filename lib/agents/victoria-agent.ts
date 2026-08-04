import {
  findVictoriaScreeningServicesViaMcp,
  listVictoriaVerifiedEventsViaMcp,
  searchVictoriaHealthInfoViaMcp,
} from "@/lib/mcp/client";
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

export type VictoriaAgentContext = {
  /** The new user turn. Used as the search query. */
  userMessage: string;
  /**
   * An already-confirmed Victorian location. The agent no longer resolves one
   * itself: scope is decided in `lib/agents/location.ts` before dispatch, so
   * that ambiguity ("which Richmond?") is settled with the user rather than
   * guessed at inside a tool call. Absent means a statewide query.
   */
  location?: string;
};

export type VictoriaAgentResult = {
  /** Numbered context block with `[1]`, `[2]` markers matching `sources`. */
  context: string;
  /** Citation chips. Empty when there was nothing to return. */
  sources: Source[];
  /**
   * Set when the MCP itself judged the location to sit outside Victoria. The
   * caller has already checked, so this is the boundary disagreeing — worth
   * honouring rather than overriding.
   */
  outsideVictoria?: boolean;
};

const EMPTY: VictoriaAgentResult = { context: "", sources: [] };

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
  const location = ctx.location?.trim();
  if (!location) return EMPTY;

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
 * Verified, unexpired Victorian events. A location is optional — a statewide
 * query has none, and so do online events — but when one is passed the caller
 * has already confirmed it is Victorian.
 */
export async function runVictoriaEventsAgent(
  ctx: VictoriaAgentContext
): Promise<VictoriaAgentResult> {
  const location = ctx.location?.trim();

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
