import { embedText } from "@/lib/rag/embed";
import { type RetrievedChunk, retrieveChunks } from "@/lib/rag/retrieve";
import type { Source } from "@/types/agents";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_SOURCE_TITLE = "(unknown source)";

export type RagAgentContext = {
  /** The user's question. Embedded and used to retrieve relevant chunks. */
  userMessage: string;
};

export type RagAgentResult = {
  /**
   * Human-readable concatenation of retrieved chunks with `[1]`, `[2]`
   * markers matching `ragSources` indices. Empty string when no chunks
   * matched. Consumed by the response agent's ctx (#28) — appended to the
   * system prompt under "Retrieved context:".
   */
  ragContext: string;
  /**
   * Structured citations for the chip renderer. Empty array when no chunks
   * matched. `id` is the 1-indexed marker; `chunkId` is the FK to
   * `knowledge_chunks.id`.
   */
  ragSources: Source[];
};

/**
 * RAG agent — embeds the user message, retrieves the top-k closest
 * `knowledge_chunks`, and returns both a flat context string and structured
 * citations. The orchestrator (#27) calls this for `health_question` intents
 * and threads the result into the response agent's ctx.
 *
 * Per CLAUDE.md: pure-ish — owns no DB connection, takes the auth-bound
 * Supabase client as a parameter. Errors from embed or retrieve propagate.
 */
export async function runRagAgent(
  supabase: SupabaseClient<Database>,
  ctx: RagAgentContext
): Promise<RagAgentResult> {
  const embedding = await embedText(ctx.userMessage);
  const chunks = await retrieveChunks(supabase, embedding);

  if (chunks.length === 0) {
    return { ragContext: "", ragSources: [] };
  }

  const ragSources: Source[] = chunks.map((c, i) => buildSource(c, i + 1));
  const ragContext = chunks.map((c, i) => formatChunk(c, i + 1)).join("\n\n");

  return { ragContext, ragSources };
}

function buildSource(chunk: RetrievedChunk, marker: number): Source {
  const url = extractUrl(chunk.metadata);
  return {
    id: String(marker),
    title: chunk.source ?? FALLBACK_SOURCE_TITLE,
    chunkId: chunk.id,
    ...(url ? { url } : {}),
  };
}

function formatChunk(chunk: RetrievedChunk, marker: number): string {
  const attribution = chunk.source ? ` (${chunk.source})` : "";
  return `[${marker}]${attribution} ${chunk.content}`;
}

function extractUrl(metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata) return undefined;
  const url = metadata.url;
  return typeof url === "string" ? url : undefined;
}
