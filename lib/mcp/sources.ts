import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The trusted-source allowlist — the single gate every MCP result passes
 * through. Spec §6: "The registry is allowlist-only."
 *
 * Nothing in this module fetches a URL. It only decides whether a URL that is
 * already in our own curated cache traces back to an approved source.
 */

export type PermittedContent = "health_content" | "directory" | "events";

export type SourceClass =
  | "commonwealth_health_authority"
  | "state_health_authority"
  | "clinical_nonprofit"
  | "directory_provider"
  | "event_organiser";

export type TrustedSource = {
  id: string;
  organisation: string;
  canonicalHost: string;
  sourceClass: SourceClass;
  jurisdiction: "AU" | "VIC";
  permittedContent: PermittedContent[];
  reviewedAt: string | null;
  approvedAt: string | null;
};

/**
 * Verification label reported for health content from this source class
 * (spec §5.1). Government bodies are `official_source`; everything else the
 * registry admits for health content is a `clinical_nonprofit`.
 */
export function verificationForClass(
  sourceClass: SourceClass
): "official_source" | "clinical_nonprofit" {
  return sourceClass === "commonwealth_health_authority" || sourceClass === "state_health_authority"
    ? "official_source"
    : "clinical_nonprofit";
}

/**
 * Extract a comparable host from a URL. Returns null for anything that is not a
 * parseable http(s) URL — a malformed or non-web `source` in the knowledge base
 * must never accidentally match a registry entry.
 */
export function hostOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Does `host` belong to `canonicalHost`? Exact match, or a subdomain of it.
 *
 * The dot in the suffix check is what stops `evilhealth.gov.au` from matching
 * the registry entry `health.gov.au`.
 */
export function hostMatches(host: string, canonicalHost: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  const c = canonicalHost.toLowerCase().replace(/^www\./, "");
  return h === c || h.endsWith(`.${c}`);
}

/**
 * Load every approved source permitted for `usage`. Reads through whatever
 * client it is given; the MCP server passes the service-role client because
 * `trusted_sources` is admin-only by RLS.
 */
export async function loadApprovedSources(
  supabase: SupabaseClient<Database>,
  usage: PermittedContent
): Promise<TrustedSource[]> {
  const { data, error } = await supabase
    .from("trusted_sources")
    .select(
      "id, organisation, canonical_host, source_class, jurisdiction, permitted_content, reviewed_at, approved_at"
    )
    .eq("status", "approved")
    .contains("permitted_content", [usage]);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    organisation: row.organisation,
    canonicalHost: row.canonical_host,
    sourceClass: row.source_class as SourceClass,
    jurisdiction: row.jurisdiction as "AU" | "VIC",
    permittedContent: row.permitted_content as PermittedContent[],
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at,
  }));
}

/**
 * Find the approved source that owns `url`, or null when no registry entry
 * claims it. Longest canonical host wins, so a more specific registration
 * (`cancerscreening.gov.au`) beats a broader one that also matches.
 */
export function matchSource(url: string, sources: TrustedSource[]): TrustedSource | null {
  const host = hostOf(url);
  if (!host) return null;

  let best: TrustedSource | null = null;
  for (const source of sources) {
    if (!hostMatches(host, source.canonicalHost)) continue;
    if (!best || source.canonicalHost.length > best.canonicalHost.length) {
      best = source;
    }
  }
  return best;
}
