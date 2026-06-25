import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GAP_LOOKBACK_DAYS } from "./constants";

export type KnowledgeGap = {
  id: string;
  question: string;
  topScore: number | null;
  source: "user" | "manual";
  createdAt: string;
  addressed: boolean;
};

type GapPayload = { question?: unknown; top_score?: unknown; source?: unknown };

/**
 * List rag_gap events from the last GAP_LOOKBACK_DAYS (newest first), each
 * flagged `addressed` when its id appears in a knowledge_candidates.gap_refs
 * array — the same "already handled" test mineGaps uses. Admin-only by RLS;
 * call under an admin-bound client (e.g. from requireAdmin()).
 */
export async function listRecentGaps(supabase: SupabaseClient<Database>): Promise<KnowledgeGap[]> {
  const since = new Date(Date.now() - GAP_LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data: gapRows, error: gapErr } = await supabase
    .from("analytics_events")
    .select("id, payload, created_at")
    .eq("event_type", "rag_gap")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (gapErr) throw new Error(gapErr.message);

  const { data: candRows, error: candErr } = await supabase
    .from("knowledge_candidates")
    .select("gap_refs");
  if (candErr) throw new Error(candErr.message);

  const addressed = new Set<string>();
  for (const row of candRows ?? []) {
    const refs = (row as { gap_refs: unknown }).gap_refs;
    if (Array.isArray(refs)) for (const r of refs) if (typeof r === "string") addressed.add(r);
  }

  return (gapRows ?? [])
    .map((r) => {
      const p = (r.payload ?? {}) as GapPayload;
      const question = typeof p.question === "string" ? p.question : "";
      return {
        id: r.id,
        question,
        topScore: typeof p.top_score === "number" ? p.top_score : null,
        source: p.source === "manual" ? ("manual" as const) : ("user" as const),
        createdAt: r.created_at,
        addressed: addressed.has(r.id),
      };
    })
    .filter((g) => g.question.length > 0);
}
