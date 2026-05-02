// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/rag/store", () => ({
  ingestDocument: vi.fn(),
}));

import { POST } from "@/app/api/embeddings/ingest/route";
import { ingestDocument } from "@/lib/rag/store";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = { role: string | null };

function mockSupabase(opts: {
  user: { id: string } | null;
  profile?: ProfileRow | null;
  profileError?: { message: string } | null;
}) {
  const profileSingle = vi
    .fn()
    .mockResolvedValue(
      opts.profileError
        ? { data: null, error: opts.profileError }
        : { data: opts.profile ?? null, error: null }
    );
  const profileEq = vi.fn().mockReturnValue({ single: profileSingle });
  const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

  const from = vi.fn((table: string) => {
    if (table === "profiles") return { select: profileSelect };
    throw new Error(`unmocked table: ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user }, error: null }),
    },
    from,
  };
}

function makeRequest(body: unknown | string): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
  return new Request("http://localhost/api/embeddings/ingest", init);
}

describe("POST /api/embeddings/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(
      mockSupabase({ user: { id: "u1" }, profile: { role: "admin" } }) as never
    );
    vi.mocked(ingestDocument).mockResolvedValue({ chunkIds: ["c1", "c2"] });
  });

  test("401 when no authenticated user", async () => {
    vi.mocked(createClient).mockReturnValueOnce(mockSupabase({ user: null }) as never);

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("403 when authenticated user is not admin", async () => {
    vi.mocked(createClient).mockReturnValueOnce(
      mockSupabase({ user: { id: "u1" }, profile: { role: "user" } }) as never
    );

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("403 when the profile row is missing", async () => {
    vi.mocked(createClient).mockReturnValueOnce(
      mockSupabase({ user: { id: "u1" }, profile: null }) as never
    );

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(403);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("400 when the body is not valid JSON", async () => {
    const res = await POST(makeRequest("not-json{"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("400 when the schema is violated (empty content)", async () => {
    const res = await POST(makeRequest({ source: "S", content: "" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("400 when source is missing", async () => {
    const res = await POST(makeRequest({ content: "hello" }));

    expect(res.status).toBe(400);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("413 when content exceeds 500KB", async () => {
    const oversize = "a".repeat(512_001);
    const res = await POST(makeRequest({ source: "S", content: oversize }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "content_too_large" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("200 happy path — admin gets { chunkIds } and ingestDocument is called with the parsed body", async () => {
    vi.mocked(ingestDocument).mockResolvedValueOnce({ chunkIds: ["c1", "c2", "c3"] });

    const res = await POST(
      makeRequest({
        source: "Cancer Council Australia",
        content: "HPV is a common virus.",
        metadata: { license: "CC-BY-4.0" },
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chunkIds: ["c1", "c2", "c3"] });
    expect(ingestDocument).toHaveBeenCalledTimes(1);
    expect(ingestDocument).toHaveBeenCalledWith(expect.anything(), {
      source: "Cancer Council Australia",
      content: "HPV is a common virus.",
      metadata: { license: "CC-BY-4.0" },
    });
  });

  test("500 when ingestDocument throws — error is logged", async () => {
    vi.mocked(ingestDocument).mockRejectedValueOnce(new Error("openai down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ source: "S", content: "hello" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "ingest_failed" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[/api/embeddings/ingest] ingest failed:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});
