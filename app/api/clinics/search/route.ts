import { searchPlacesApi } from "@/lib/clinics/search-places";
import { clinicSearchQuerySchema } from "@/lib/validations/clinic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = clinicSearchQuerySchema.safeParse({
    location: searchParams.get("location") ?? "",
    keyword: searchParams.get("keyword") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof searchPlacesApi>>;
  try {
    result = await searchPlacesApi(parsed.data);
  } catch (err) {
    console.error("[clinics] unexpected error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  if (result.status === "upstream_error" || result.status === "fetch_failed") {
    return Response.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  return Response.json({ clinics: result.clinics });
}
