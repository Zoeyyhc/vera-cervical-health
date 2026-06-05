import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runDiscoveryLlm } from "./llm";
import { SUMMARIZE_CANDIDATE_PROMPT } from "./prompts";
import type { CandidateScores, ExtractedPage } from "./types";

export type StageCandidateInput = {
  sourceUrl: string;
  page: ExtractedPage;
  scores: CandidateScores;
  gapEventIds: string[];
  contentHash: string;
};

function parseSummary(raw: string): { summary: string; tags: string[] } {
  try {
    const p = JSON.parse(raw) as { summary?: unknown; tags?: unknown };
    return {
      summary: typeof p.summary === "string" ? p.summary : "",
      tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : [],
    };
  } catch {
    return { summary: "", tags: [] };
  }
}

/**
 * Summarize + tag an extracted candidate, then insert it as a `pending` row in
 * knowledge_candidates. Returns the new id, or null when the content_hash
 * unique constraint rejects it (already staged). Other insert errors throw.
 */
export async function stageCandidate(
  supabaseAdmin: SupabaseClient<Database>,
  input: StageCandidateInput
): Promise<string | null> {
  const raw = await runDiscoveryLlm(
    SUMMARIZE_CANDIDATE_PROMPT,
    input.page.content,
    "discovery.summarize-candidate"
  );
  const { summary, tags } = parseSummary(raw);

  const { data, error } = await supabaseAdmin
    .from("knowledge_candidates")
    .insert({
      source_url: input.sourceUrl,
      title: input.page.title,
      raw_content: input.page.content,
      summary,
      authority_score: input.scores.authorityScore,
      relevance_score: input.scores.relevanceScore,
      domain_tags: tags,
      gap_refs: input.gapEventIds,
      content_hash: input.contentHash,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") return null; // duplicate content_hash
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}
