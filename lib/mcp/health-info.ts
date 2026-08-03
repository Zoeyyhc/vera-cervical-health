import {
  type HealthInfoItem,
  MAX_RESULTS,
  type SearchHealthInfoInput,
  type SearchHealthInfoOutput,
} from "@/lib/mcp/schemas";
import { loadApprovedSources, matchSource, verificationForClass } from "@/lib/mcp/sources";
import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `search_victoria_health_info` — approved, consumer-facing cervical-health
 * information.
 *
 * The curated cache is the EXISTING `knowledge_chunks` table (spec §3.4 and §6:
 * reuse the knowledge review workflow, don't stand up a second content store).
 * This tool adds the governance layer on top: a chunk is only returned when its
 * `metadata.url` traces back to an `approved` trusted source permitted for
 * health content. WHO/CDC/NHS material stays in the knowledge base and is still
 * reachable through the ordinary RAG path — it is simply outside the Victorian
 * source registry, so it is not returned here.
 *
 * No network fetch happens here beyond embedding the query. Nothing is scraped,
 * and no user-supplied URL is ever dereferenced.
 */

/** Retrieve wider than we return, because the allowlist filter drops rows. */
const RETRIEVE_COUNT = 20;

/** Excerpt budget, in characters. Trimmed at a word boundary. */
const EXCERPT_CHARS = 400;

/**
 * Topic hints appended to the embedded query. `topic` biases retrieval rather
 * than hard-filtering: chunks carry no reliable per-topic tag, and a hard filter
 * on absent metadata would return nothing.
 */
const TOPIC_HINTS: Record<NonNullable<SearchHealthInfoInput["topic"]>, string> = {
  screening: "cervical screening test",
  hpv: "human papillomavirus HPV infection",
  vaccination: "HPV vaccination immunisation",
  self_collection: "self-collection self-collected cervical screening sample",
  support: "support services counselling after a cervical screening result",
};

export type HealthInfoResult = SearchHealthInfoOutput & {
  /** Registry ids behind the returned items, for the audit log. */
  sourceIds: string[];
};

export async function searchVictoriaHealthInfo(
  supabase: SupabaseClient<Database>,
  input: SearchHealthInfoInput
): Promise<HealthInfoResult> {
  const sources = await loadApprovedSources(supabase, "health_content");
  if (sources.length === 0) {
    return { items: [], noResultReason: "no_approved_match", sourceIds: [] };
  }

  const query = input.topic ? `${input.query} ${TOPIC_HINTS[input.topic]}` : input.query;
  const embedding = await embedText(query);
  const chunks = await retrieveChunks(supabase, embedding, { count: RETRIEVE_COUNT });

  const items: HealthInfoItem[] = [];
  const sourceIds: string[] = [];
  const seenUrls = new Set<string>();

  for (const chunk of chunks) {
    if (items.length >= MAX_RESULTS) break;

    const url = readUrl(chunk.metadata);
    if (!url || seenUrls.has(url)) continue;

    const source = matchSource(url, sources);
    if (!source) continue;

    // A source with no recorded review date cannot be attested to, and every
    // result must carry `reviewedAt` (spec §5.1). Skip rather than invent one.
    const reviewedAt = source.reviewedAt ?? source.approvedAt;
    if (!reviewedAt) continue;

    seenUrls.add(url);
    items.push({
      id: chunk.id,
      title: chunk.source ?? source.organisation,
      excerpt: truncate(chunk.content, EXCERPT_CHARS),
      sourceName: source.organisation,
      sourceUrl: url,
      jurisdiction: source.jurisdiction,
      verification: verificationForClass(source.sourceClass),
      ...(readPublishedAt(chunk.metadata) ? { publishedAt: readPublishedAt(chunk.metadata) } : {}),
      reviewedAt,
    });
    if (!sourceIds.includes(source.id)) sourceIds.push(source.id);
  }

  if (items.length === 0) {
    return { items: [], noResultReason: "no_approved_match", sourceIds: [] };
  }
  return { items, sourceIds };
}

function readUrl(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const url = metadata.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function readPublishedAt(metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata) return undefined;
  const value = metadata.published_at ?? metadata.publishedAt;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
