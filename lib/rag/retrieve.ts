import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_THRESHOLD = 0.75;
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
  /** Cosine similarity floor. Default 0.75 (project spec). */
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
