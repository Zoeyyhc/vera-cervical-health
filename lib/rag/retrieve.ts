import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Empirically tuned 2026-05-03: text-embedding-3-small produces top-similarity
// scores of 0.54–0.60 for clearly relevant chunks against this KB's seed (see
// `scripts/rag-query.ts` for measurement). 0.75 (the original spec) returned
// zero chunks for every typical health question. 0.45 captures the top 3–5
// chunks per typical query while excluding the noise tail.
const DEFAULT_THRESHOLD = 0.45;
const DEFAULT_COUNT = 5;

export type RetrievedChunk = {
  id: string;
  source: string | null;
  content: string;
  /** Cosine similarity, 0–1. Higher = closer match. */
  similarityScore: number;
  metadata: Record<string, unknown> | null;
};

export type RetrieveOptions = {
  /** Cosine similarity floor. Default 0.45 (empirically tuned — see retrieve.ts comment). */
  threshold?: number;
  /** Max chunks returned. Default 5. */
  count?: number;
};

/**
 * Retrieve knowledge_chunks above a cosine-similarity threshold via the
 * existing `match_knowledge_chunks` RPC (defined in Epic 1's migration).
 *
 * RLS allows all authenticated users to SELECT, so the RPC works under any
 * signed-in user's session — no service role needed.
 *
 * Throws when the RPC errors. Empty result is `[]` (not null).
 */
export async function retrieveChunks(
  supabase: SupabaseClient<Database>,
  queryEmbedding: number[],
  opts: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const count = opts.count ?? DEFAULT_COUNT;

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    // PostgREST's introspection types this as `string` but at runtime
    // Supabase JS serializes a number[] correctly and pgvector casts it.
    // biome-ignore lint/suspicious/noExplicitAny: pgvector arg type erasure
    query_embedding: queryEmbedding as any,
    match_threshold: threshold,
    match_count: count,
  });

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    source: row.source,
    content: row.content,
    similarityScore: row.similarity_score,
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}
