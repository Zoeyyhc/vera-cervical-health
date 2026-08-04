import { searchEventsApi } from "@/lib/events/search-events";
import { eventsQuerySchema } from "@/lib/validations/events";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = eventsQuerySchema.safeParse({
    location: searchParams.get("location") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    max: searchParams.get("max") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await searchEventsApi({
    location: parsed.data.location,
    query: parsed.data.q,
    max_results: parsed.data.max,
  });

  if (result.status === "no_results") {
    return Response.json({ events: [], error: "no_results" });
  }
  if (result.status === "upstream_unavailable") {
    return Response.json({ events: [], error: "upstream_unavailable" });
  }
  return Response.json({ events: result.events });
}
