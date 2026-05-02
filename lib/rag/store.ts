import { chunkText } from "@/lib/rag/chunking";
import { embedText } from "@/lib/rag/embed";
import type { Database, Json } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Maximum number of concurrent embedding API calls. A 50KB document chunks
 * to ~25 chunks; a cap of 5 keeps us polite to OpenAI rate limits while
 * still completing a typical ingest in a handful of round-trips. Hand-rolled
 * batching loop — no p-limit dependency.
 */
export const EMBED_CONCURRENCY = 5;

export type IngestDocumentInput = {
  /** Raw document text. Will be chunked. */
  content: string;
  /** Document name or URL — applied to every chunk. */
  source: string;
  /** Optional metadata applied to every chunk (jsonb). */
  metadata?: Record<string, unknown>;
};

export type IngestDocumentResult = {
  /** UUIDs of the inserted chunks, in chunk order. */
  chunkIds: string[];
};

type InsertRow = Database["public"]["Tables"]["knowledge_chunks"]["Insert"];

/**
 * Chunk a document, embed each chunk in batches, and bulk-insert all chunks
 * into `knowledge_chunks`. Returns the inserted chunk UUIDs in chunk order.
 *
 * Failure modes (all reject):
 *   - `embedText` rejects → no insert is performed
 *   - Supabase insert returns an error → throws with `error.message`
 *
 * Empty input (or chunkText returning []) → `{ chunkIds: [] }` with no
 * API/DB calls. Caller is responsible for being on an admin Supabase session
 * (RLS gates the insert).
 */
export async function ingestDocument(
  supabase: SupabaseClient<Database>,
  input: IngestDocumentInput
): Promise<IngestDocumentResult> {
  const chunks = chunkText(input.content);
  if (chunks.length === 0) return { chunkIds: [] };

  const embeddings = await embedInBatches(chunks, EMBED_CONCURRENCY);

  const rows: InsertRow[] = chunks.map((content, i) => ({
    source: input.source,
    content,
    // pgvector accepts number[] at runtime; generated types model the column
    // as string. Same pattern as lib/rag/retrieve.ts.
    // biome-ignore lint/suspicious/noExplicitAny: pgvector arg type erasure
    embedding: embeddings[i] as any,
    // Caller-friendly Record<string, unknown> at the API surface; cast to the
    // generated Json type for the insert. Genuinely non-serializable values
    // (functions, Dates, etc.) would error at PostgREST serialization.
    metadata: input.metadata as Json | undefined,
  }));

  const { data, error } = await supabase.from("knowledge_chunks").insert(rows).select("id");

  if (error) throw new Error(error.message);

  return { chunkIds: (data ?? []).map((row) => row.id) };
}

async function embedInBatches(chunks: string[], cap: number): Promise<number[][]> {
  const results: number[][] = new Array(chunks.length);
  for (let start = 0; start < chunks.length; start += cap) {
    const slice = chunks.slice(start, start + cap);
    const embedded = await Promise.all(slice.map((c) => embedText(c)));
    for (let j = 0; j < embedded.length; j++) {
      results[start + j] = embedded[j];
    }
  }
  return results;
}
