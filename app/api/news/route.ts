import { searchNewsApi } from "@/lib/news/search-news";
import { newsQuerySchema } from "@/lib/validations/news";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = newsQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    max: searchParams.get("max") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const articles = await searchNewsApi({
    query: parsed.data.q,
    max_results: parsed.data.max,
  });

  if (articles.length === 0) {
    return Response.json({ articles: [], error: "unavailable" });
  }
  return Response.json({ articles });
}
