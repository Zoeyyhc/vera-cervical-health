import {
  type ListVerifiedEventsInput,
  type ListVerifiedEventsOutput,
  MAX_RESULTS,
  type VerifiedEvent,
} from "@/lib/mcp/schemas";
import { melbourneToday, resolveVictoriaScope } from "@/lib/mcp/victoria";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `list_victoria_verified_events` — current, public Victorian cervical-health
 * education or screening-promotion events.
 *
 * Spec §5.3 + §6: every event is entered or imported by an administrator from an
 * approved organiser and is invisible until approved. Expired events are
 * excluded automatically — `verified_events.expires_at` is a generated column
 * (`coalesce(ends_at, starts_at)`), so expiry cannot drift out of sync with the
 * dates an admin entered. No SerpAPI, no web search, no social media.
 */

export type EventsResult = ListVerifiedEventsOutput & {
  /** Registry ids behind the returned events, for the audit log. */
  sourceIds: string[];
};

export async function listVictoriaVerifiedEvents(
  supabase: SupabaseClient<Database>,
  input: ListVerifiedEventsInput,
  now: Date = new Date()
): Promise<EventsResult> {
  // A location is optional — statewide and online events have none. When one is
  // supplied it must be Victorian.
  if (input.location) {
    const scope = resolveVictoriaScope(input.location);
    if (!scope.inVictoria) {
      return { events: [], noResultReason: "outside_victoria", sourceIds: [] };
    }
  }

  // "Upcoming" is relative to today in Melbourne, not the server's timezone.
  const fromDate = input.fromDate ?? melbourneToday(now);
  const fromInstant = `${fromDate}T00:00:00+10:00`;

  const filtered = supabase
    .from("verified_events")
    .select(
      "id, name, starts_at, ends_at, expires_at, location_label, format, registration_url, source_url, reviewed_at, topic, trusted_sources!inner(id, organisation, status, permitted_content)"
    )
    .eq("status", "approved")
    .eq("trusted_sources.status", "approved")
    .contains("trusted_sources.permitted_content", ["events"])
    // Two separate bounds: nothing already expired, and nothing before the
    // caller's window opens.
    .gte("expires_at", nowInstant(now))
    .gte("expires_at", fromInstant);

  // Every filter goes on before order/limit — `.limit()` terminates the chain.
  const scoped = input.topic ? filtered.eq("topic", input.topic) : filtered;

  const { data, error } = await scoped.order("starts_at", { ascending: true }).limit(MAX_RESULTS);
  if (error) throw new Error(error.message);

  const events: VerifiedEvent[] = [];
  const sourceIds: string[] = [];

  for (const row of data ?? []) {
    // Both are set by the approval action; skip anything that somehow lacks the
    // attestation the output contract requires.
    if (!row.reviewed_at || !row.expires_at) continue;

    events.push({
      id: row.id,
      name: row.name,
      startsAt: row.starts_at,
      ...(row.ends_at ? { endsAt: row.ends_at } : {}),
      locationLabel: row.location_label,
      format: row.format as VerifiedEvent["format"],
      organiser: row.trusted_sources.organisation,
      registrationUrl: row.registration_url,
      sourceUrl: row.source_url,
      verification: "manually_curated",
      reviewedAt: row.reviewed_at,
      expiresAt: row.expires_at,
    });
    const sourceId = row.trusted_sources.id;
    if (!sourceIds.includes(sourceId)) sourceIds.push(sourceId);
  }

  if (events.length === 0) {
    return { events: [], noResultReason: "no_upcoming_events", sourceIds: [] };
  }
  return { events, sourceIds };
}

function nowInstant(now: Date): string {
  return now.toISOString();
}
