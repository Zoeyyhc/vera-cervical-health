import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type KnowledgeDocument = {
  /** Grouping key; null for chunks with no source. */
  source: string | null;
  /** Representative metadata.title, or null. */
  title: string | null;
  chunkCount: number;
  /** Earliest created_at across the document's chunks (ISO string). */
  createdAt: string;
};

/**
 * List every document in the knowledge base (one row per distinct `source`),
 * newest first. Backed by the list_knowledge_documents() RPC so embeddings are
 * never pulled into the app layer. Admin-gated at the caller; RLS allows
 * authenticated SELECT on knowledge_chunks.
 */
export async function listKnowledgeDocuments(
  supabase: SupabaseClient<Database>
): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase.rpc("list_knowledge_documents");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    source: row.source,
    title: row.title,
    chunkCount: Number(row.chunk_count),
    createdAt: row.created_at,
  }));
}

/**
 * Delete every chunk for a document. `null` targets the "(no source)" group
 * via `.is`, otherwise an exact `.eq` match. Hard delete — no soft delete in v1.
 * Caller must be on an admin-bound client (RLS gates the delete).
 */
export async function deleteKnowledgeDocument(
  supabase: SupabaseClient<Database>,
  source: string | null
): Promise<void> {
  const base = supabase.from("knowledge_chunks").delete();
  const { error } = await (source === null ? base.is("source", null) : base.eq("source", source));
  if (error) throw new Error(error.message);
}
