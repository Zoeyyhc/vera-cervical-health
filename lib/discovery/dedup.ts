import { createHash } from "node:crypto";
import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEDUP_SNIPPET_CHARS, DEDUP_THRESHOLD } from "./constants";

export type DuplicateCheck = {
  duplicate: boolean;
  /** sha256 of the full content — used as knowledge_candidates.content_hash. */
  contentHash: string;
};

/**
 * Decide whether extracted content is already covered by the KB. Embeds the
 * leading snippet and runs a single-result similarity search at
 * DEDUP_THRESHOLD; any hit means duplicate. Also returns a sha256 content hash
 * for the staging row's unique constraint.
 */
export async function checkDuplicate(
  supabaseAdmin: SupabaseClient<Database>,
  content: string
): Promise<DuplicateCheck> {
  const contentHash = createHash("sha256").update(content).digest("hex");

  const embedding = await embedText(content.slice(0, DEDUP_SNIPPET_CHARS));
  const hits = await retrieveChunks(supabaseAdmin, embedding, {
    threshold: DEDUP_THRESHOLD,
    count: 1,
  });

  return { duplicate: hits.length > 0, contentHash };
}
