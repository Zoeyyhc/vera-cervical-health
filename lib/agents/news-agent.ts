import { fetchHealthNews } from "@/lib/tools/news";
import type { NewsArticle } from "@/lib/validations/news";
import type { Source } from "@/types/agents";

const MAX_RESULTS = 5;

// Conversational filler that's natural in a chat bubble ("Show me the latest
// cervical health news.") but noise to NewsAPI's implicit-AND search. After
// stripping these tokens, what's left is the actual search intent.
const NOISE_WORDS = new Set([
  "show",
  "tell",
  "give",
  "find",
  "look",
  "see",
  "me",
  "i",
  "us",
  "we",
  "the",
  "a",
  "an",
  "any",
  "some",
  "latest",
  "recent",
  "today",
  "todays",
  "this",
  "week",
  "weeks",
  "current",
  "new",
  "news",
  "headlines",
  "stories",
  "updates",
  "coverage",
  "articles",
  "article",
  "please",
  "want",
  "wanted",
  "to",
  "for",
  "about",
  "regarding",
  "on",
  "of",
  "in",
  "what",
  "whats",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "and",
  "or",
]);

function isNoise(token: string): boolean {
  if (NOISE_WORDS.has(token)) return true;
  // Strip trailing "'s" so "what's" / "today's" match the filler list but
  // "women's" / "child's" stay as content (since "women" / "child" aren't
  // noise themselves).
  if (token.endsWith("'s") && NOISE_WORDS.has(token.slice(0, -2))) return true;
  return false;
}

export function refineNewsQuery(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !isNoise(t))
    .join(" ");
}

export type NewsAgentContext = {
  /** The new user turn — refined into a NewsAPI-friendly query before search. */
  userMessage: string;
};

export type NewsAgentResult = {
  /**
   * Numbered concatenation of news items with `[1]`, `[2]` markers matching
   * `newsSources`. Empty string when the upstream returns nothing. Consumed
   * by the response agent under a "Recent news:" header.
   */
  newsContext: string;
  /**
   * Citation chips for the chat UI. `chunkId` is `news:<url>` so the chip
   * renderer (which keys on chunkId) can dedupe across turns even though
   * news items have no DB row.
   */
  newsSources: Source[];
};

/**
 * News agent — pulls health-domain headlines via `fetchHealthNews` and
 * shapes them into the same `{ context, sources }` envelope the RAG agent
 * uses, so the response agent and citation chips treat both paths uniformly.
 *
 * Per CLAUDE.md: pure function, never throws. The tool already swallows
 * upstream errors into `[]`; we still defensively wrap to keep the
 * orchestrator path graceful if that contract ever drifts.
 */
export async function runNewsAgent(ctx: NewsAgentContext): Promise<NewsAgentResult> {
  let articles: NewsArticle[] = [];
  try {
    articles = await fetchHealthNews({
      query: refineNewsQuery(ctx.userMessage),
      max_results: MAX_RESULTS,
    });
  } catch (err) {
    console.error(
      "[news-agent] fetchHealthNews unexpectedly threw:",
      err instanceof Error ? err.message : err
    );
    return { newsContext: "", newsSources: [] };
  }

  if (articles.length === 0) {
    return { newsContext: "", newsSources: [] };
  }

  const newsSources: Source[] = articles.map((a, i) => ({
    id: String(i + 1),
    title: a.title,
    url: a.url,
    chunkId: `news:${a.url}`,
  }));
  const newsContext = articles.map((a, i) => formatArticle(a, i + 1)).join("\n\n");

  return { newsContext, newsSources };
}

function formatArticle(article: NewsArticle, marker: number): string {
  const date = article.published_at.slice(0, 10);
  const head = `[${marker}] ${article.title} — ${article.source} (${date})`;
  return article.description ? `${head}\n${article.description}` : head;
}
