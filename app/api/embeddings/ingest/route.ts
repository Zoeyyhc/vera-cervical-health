import { ingestDocument } from "@/lib/rag/store";
import { createClient } from "@/lib/supabase/server";
import { ingestRequestSchema } from "@/lib/validations/embeddings";

const MAX_CONTENT_BYTES = 512_000; // 500KB

export async function POST(request: Request) {
  const supabase = createClient();

  // 1. Auth — bail before parsing the body
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Admin role gate (server-side, every request, per CLAUDE.md)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // 3. Parse + validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ingestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // 4. Size check — bytes-on-the-wire, not codepoints
  if (Buffer.byteLength(parsed.data.content, "utf8") > MAX_CONTENT_BYTES) {
    return Response.json({ error: "content_too_large" }, { status: 413 });
  }

  // 5. Ingest
  try {
    const result = await ingestDocument(supabase, parsed.data);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/embeddings/ingest] ingest failed:", err);
    return Response.json({ error: "ingest_failed" }, { status: 500 });
  }
}
