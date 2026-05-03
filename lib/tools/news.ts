import { searchNewsApi } from "@/lib/news/search-news";
import type { NewsArticle } from "@/lib/validations/news";

export type FetchHealthNewsInput = {
  query?: string;
  max_results?: number;
};

/**
 * News Agent's tool wrapper. Surfaces the same data the `/api/news` proxy
 * returns — both share `searchNewsApi` so the upstream call has a single
 * implementation. Never throws; returns `[]` on any failure.
 */
export async function fetchHealthNews(input: FetchHealthNewsInput = {}): Promise<NewsArticle[]> {
  return searchNewsApi(input);
}
