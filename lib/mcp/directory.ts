import {
  type DirectoryLink,
  type FindScreeningServicesInput,
  type FindScreeningServicesOutput,
  MAX_RESULTS,
} from "@/lib/mcp/schemas";
import { resolveVictoriaScope } from "@/lib/mcp/victoria";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `find_victoria_screening_services` — a trustworthy path to a Victorian
 * screening provider WITHOUT Vera operating a clinic directory.
 *
 * Spec §5.2: v0.1 returns approved first-party directory deep links and filters,
 * never copied provider records. There is no `clinics` table and none is read
 * here. Every result is labelled `directory_listing` and carries the
 * confirmation notice the Response Agent must surface.
 */

/** Placeholder an admin may put in `search_url_template` to receive the location. */
const LOCATION_TOKEN = "{location}";

export type DirectoryResult = FindScreeningServicesOutput & {
  /** Registry ids behind the returned links, for the audit log. */
  sourceIds: string[];
};

export async function findVictoriaScreeningServices(
  supabase: SupabaseClient<Database>,
  input: FindScreeningServicesInput
): Promise<DirectoryResult> {
  const scope = resolveVictoriaScope(input.location);
  if (!scope.inVictoria) {
    // Explicit non-result. v0.1 never widens to a nationwide search (spec §4).
    return { directoryLinks: [], noResultReason: "outside_victoria", sourceIds: [] };
  }

  // Only approved links, and only from sources still approved for directory use
  // — an inner join, so revoking the source immediately hides its links.
  const { data, error } = await supabase
    .from("directory_links")
    .select(
      "id, directory_name, search_url_template, supports, confirmation_notice, reviewed_at, sort_order, source_id, trusted_sources!inner(id, status, permitted_content)"
    )
    .eq("status", "approved")
    .eq("trusted_sources.status", "approved")
    .contains("trusted_sources.permitted_content", ["directory"])
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const wanted = requestedSupports(input);

  // Preference matching is a soft ranking, not a filter: a directory that does
  // not advertise self-collection may still list providers offering it, and
  // dropping every link would leave the user with nowhere to go.
  const ranked = [...rows].sort((a, b) => {
    const score = (supports: string[]) => wanted.filter((w) => supports.includes(w)).length;
    const diff = score(b.supports) - score(a.supports);
    return diff !== 0 ? diff : a.sort_order - b.sort_order;
  });

  const directoryLinks: DirectoryLink[] = [];
  const sourceIds: string[] = [];

  for (const row of ranked) {
    if (directoryLinks.length >= MAX_RESULTS) break;
    // Every link must carry a review date (spec §5.2 output contract).
    if (!row.reviewed_at) continue;

    directoryLinks.push({
      directoryName: row.directory_name,
      searchUrl: buildSearchUrl(row.search_url_template, input.location),
      coverage: "VIC",
      supports: row.supports,
      verification: "directory_listing",
      reviewedAt: row.reviewed_at,
      confirmationNotice: row.confirmation_notice,
    });
    if (!sourceIds.includes(row.source_id)) sourceIds.push(row.source_id);
  }

  if (directoryLinks.length === 0) {
    return { directoryLinks: [], noResultReason: "no_approved_directory", sourceIds: [] };
  }
  return { directoryLinks, sourceIds };
}

/**
 * Substitute the user's location into the approved template.
 *
 * The template comes from the registry, never from the caller, so the host can
 * only ever be one an admin approved. The location is URL-encoded before
 * substitution. Templates without the token — the v0.1 default, used until an
 * admin has confirmed a directory's real query-string format — are returned
 * verbatim.
 */
export function buildSearchUrl(template: string, location: string): string {
  if (!template.includes(LOCATION_TOKEN)) return template;
  return template.replaceAll(LOCATION_TOKEN, encodeURIComponent(location.trim()));
}

function requestedSupports(input: FindScreeningServicesInput): string[] {
  const prefs = input.preferences;
  if (!prefs) return [];
  const wanted: string[] = [];
  if (prefs.selfCollection) wanted.push("self_collection");
  if (prefs.accessibility) wanted.push("accessibility");
  if (prefs.language) wanted.push("interpreter");
  return wanted;
}
