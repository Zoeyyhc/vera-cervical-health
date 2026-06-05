import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingCandidate = {
  id: string;
  source_url: string;
  title: string | null;
  summary: string | null;
  authority_score: number | null;
  relevance_score: number | null;
  domain_tags: string[];
  gap_refs: string[];
  raw_content: string;
  created_at: string;
};

/**
 * Load all pending knowledge candidates, most authoritative first. Admin-only
 * by RLS — call under an admin-bound client (e.g. from requireAdmin()).
 */
export async function listPendingCandidates(
  supabase: SupabaseClient<Database>
): Promise<PendingCandidate[]> {
  const { data, error } = await supabase
    .from("knowledge_candidates")
    .select(
      "id, source_url, title, summary, authority_score, relevance_score, domain_tags, gap_refs, raw_content, created_at"
    )
    .eq("status", "pending")
    .order("authority_score", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PendingCandidate[];
}
