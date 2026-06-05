import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GAP_LOOKBACK_DAYS, MAX_GAP_CLUSTERS } from "./constants";
import { runDiscoveryLlm } from "./llm";
import { CLUSTER_GAPS_PROMPT } from "./prompts";
import type { GapCluster } from "./types";

type GapPayload = { question?: unknown; top_score?: unknown };

/**
 * Read recent rag_gap events, drop ones already addressed by a staged
 * candidate, ask the LLM to cluster the rest into distinct in-domain topics,
 * and return up to MAX_GAP_CLUSTERS. Returns [] when there are no fresh gaps
 * or the LLM output can't be parsed.
 */
export async function mineGaps(supabaseAdmin: SupabaseClient<Database>): Promise<GapCluster[]> {
  const since = new Date(Date.now() - GAP_LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data: gapRows, error: gapErr } = await supabaseAdmin
    .from("analytics_events")
    .select("id, payload")
    .eq("event_type", "rag_gap")
    .gte("created_at", since);
  if (gapErr) throw new Error(gapErr.message);

  const { data: candRows, error: candErr } = await supabaseAdmin
    .from("knowledge_candidates")
    .select("gap_refs");
  if (candErr) throw new Error(candErr.message);

  const addressed = new Set<string>();
  for (const row of candRows ?? []) {
    const refs = (row as { gap_refs: unknown }).gap_refs;
    if (Array.isArray(refs)) for (const r of refs) if (typeof r === "string") addressed.add(r);
  }

  const fresh = (gapRows ?? [])
    .filter((r) => !addressed.has(r.id))
    .map((r) => {
      const p = (r.payload ?? {}) as GapPayload;
      return { id: r.id, question: typeof p.question === "string" ? p.question : "" };
    })
    .filter((g) => g.question.length > 0);

  if (fresh.length === 0) return [];

  const raw = await runDiscoveryLlm(
    CLUSTER_GAPS_PROMPT,
    JSON.stringify(fresh),
    "discovery.cluster"
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const clusters: GapCluster[] = [];
  for (const c of parsed) {
    const theme = (c as { theme?: unknown }).theme;
    const ids = (c as { gapEventIds?: unknown }).gapEventIds;
    if (typeof theme !== "string" || !Array.isArray(ids)) continue;
    const gapEventIds = ids.filter((id): id is string => typeof id === "string");
    if (gapEventIds.length === 0) continue;
    clusters.push({ theme, gapEventIds });
    if (clusters.length >= MAX_GAP_CLUSTERS) break;
  }
  return clusters;
}
