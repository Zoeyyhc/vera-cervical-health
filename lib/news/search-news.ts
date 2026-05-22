import { env } from "@/lib/env";
import type { NewsArticle } from "@/lib/validations/news";

const NEWSAPI_ENDPOINT = "https://newsapi.org/v2/everything";
const HEALTH_DOMAIN_BASE = "cervical health OR HPV OR women's health";
const WINDOW_DAYS = 7;

export type SearchNewsInput = {
  query?: string;
  max_results?: number;
};

type UpstreamArticle = {
  title?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  description?: string | null;
  source?: { name?: string | null } | null;
};

type UpstreamResponse = {
  status?: string;
  articles?: UpstreamArticle[];
};

/**
 * Single source of truth for the NewsAPI call.
 * Used directly by the news agent's tool wrapper and by the `/api/news` proxy.
 * Never throws — always resolves to an array (empty on any failure) so callers
 * can degrade gracefully without try/catch boilerplate.
 */
export async function searchNewsApi({
  query = "",
  max_results = 5,
}: SearchNewsInput): Promise<NewsArticle[]> {
  const max = Math.min(Math.max(max_results, 1), 10);
  const userQuery = query.trim();
  // NewsAPI's q parameter treats unquoted multi-word strings as an implicit
  // AND across every token, so wrapping `(user) AND (domain)` requires every
  // user word PLUS a domain match to coexist — empirically returns 0 even
  // for natural prompts like "latest cervical and women's health news".
  // Trust the upstream classifier to route only news_request here; pass the
  // user query through unwrapped, fall back to the broad domain query when
  // empty.
  const q = userQuery || HEALTH_DOMAIN_BASE;

  const from = isoDateNDaysAgo(WINDOW_DAYS);

  const url = new URL(NEWSAPI_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("from", from);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(max));
  url.searchParams.set("language", "en");
  url.searchParams.set("apiKey", env.newsApiKey);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("[news] upstream fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }

  if (!upstream.ok) {
    console.error(`[news] upstream non-2xx: ${upstream.status}`);
    return [];
  }

  let data: UpstreamResponse;
  try {
    data = (await upstream.json()) as UpstreamResponse;
  } catch {
    return [];
  }

  if (!Array.isArray(data.articles)) return [];

  const normalized: NewsArticle[] = [];
  for (const a of data.articles) {
    const title = a.title?.trim();
    const url = a.url?.trim();
    const sourceName = a.source?.name?.trim();
    const publishedAt = a.publishedAt?.trim();
    if (!title || !url || !sourceName || !publishedAt) continue;
    normalized.push({
      title,
      source: sourceName,
      url,
      published_at: publishedAt,
      description: a.description ?? null,
    });
    if (normalized.length >= max) break;
  }
  return normalized;
}

function isoDateNDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
