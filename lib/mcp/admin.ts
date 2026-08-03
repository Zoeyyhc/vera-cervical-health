import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read queries for the /admin/trusted-health review surface.
 *
 * These run under the admin's RLS-bound client (from `requireAdmin()`), not the
 * service-role client — the admin-only policies on these tables are the gate.
 */

export type AdminTrustedSource = {
  id: string;
  organisation: string;
  canonical_host: string;
  source_class: string;
  jurisdiction: string;
  permitted_content: string[];
  status: string;
  approved_at: string | null;
  reviewed_at: string | null;
  next_review_at: string | null;
  notes: string | null;
};

export type AdminVerifiedEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  expires_at: string | null;
  location_label: string;
  format: string;
  topic: string | null;
  registration_url: string;
  source_url: string;
  status: string;
  reviewed_at: string | null;
  organisation: string;
};

export type AdminDirectoryLink = {
  id: string;
  directory_name: string;
  search_url_template: string;
  supports: string[];
  status: string;
  reviewed_at: string | null;
  next_review_at: string | null;
  organisation: string;
};

export async function listTrustedSources(
  supabase: SupabaseClient<Database>
): Promise<AdminTrustedSource[]> {
  const { data, error } = await supabase
    .from("trusted_sources")
    .select(
      "id, organisation, canonical_host, source_class, jurisdiction, permitted_content, status, approved_at, reviewed_at, next_review_at, notes"
    )
    .order("organisation", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Every event regardless of status or expiry — the admin needs to see pending
 * and expired rows, which is exactly what the MCP does not return.
 */
export async function listVerifiedEvents(
  supabase: SupabaseClient<Database>
): Promise<AdminVerifiedEvent[]> {
  const { data, error } = await supabase
    .from("verified_events")
    .select(
      "id, name, starts_at, ends_at, expires_at, location_label, format, topic, registration_url, source_url, status, reviewed_at, trusted_sources!inner(organisation)"
    )
    .order("starts_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(({ trusted_sources, ...row }) => ({
    ...row,
    organisation: trusted_sources.organisation,
  }));
}

export async function listDirectoryLinks(
  supabase: SupabaseClient<Database>
): Promise<AdminDirectoryLink[]> {
  const { data, error } = await supabase
    .from("directory_links")
    .select(
      "id, directory_name, search_url_template, supports, status, reviewed_at, next_review_at, sort_order, trusted_sources!inner(organisation)"
    )
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(({ trusted_sources, sort_order: _sortOrder, ...row }) => ({
    ...row,
    organisation: trusted_sources.organisation,
  }));
}

/** True when an event's derived expiry has passed — the MCP will not return it. */
export function isExpired(event: AdminVerifiedEvent, now: Date = new Date()): boolean {
  if (!event.expires_at) return false;
  return new Date(event.expires_at).getTime() < now.getTime();
}

/** Options for the "organiser" select on the new-event form. */
export function eventOrganiserOptions(
  sources: AdminTrustedSource[]
): Array<{ id: string; label: string }> {
  return sources
    .filter((s) => s.status === "approved" && s.permitted_content.includes("events"))
    .map((s) => ({ id: s.id, label: s.organisation }));
}
