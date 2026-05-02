// @vitest-environment node

import type { RetrievedChunk } from "@/lib/rag/retrieve";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({
  embedText: vi.fn(),
}));

vi.mock("@/lib/rag/retrieve", () => ({
  retrieveChunks: vi.fn(),
}));

import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { runRagAgent } from "./rag-agent";

const fakeSupabase = {} as unknown as Parameters<typeof runRagAgent>[0];

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "chunk-uuid-1",
    source: "Cancer Council Australia",
    content: "HPV is a common virus.",
    similarityScore: 0.9,
    metadata: null,
    ...overrides,
  };
}

describe("runRagAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
    vi.mocked(retrieveChunks).mockResolvedValue([]);
  });

  test("calls embedText with the userMessage and retrieveChunks with the embedding", async () => {
    const embedding = Array.from({ length: 1536 }, () => 0.5);
    vi.mocked(embedText).mockResolvedValue(embedding);

    await runRagAgent(fakeSupabase, { userMessage: "What is HPV?" });

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("What is HPV?");
    expect(retrieveChunks).toHaveBeenCalledTimes(1);
    expect(retrieveChunks).toHaveBeenCalledWith(fakeSupabase, embedding);
  });

  test("returns empty ragContext and empty ragSources when no chunks match", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result).toEqual({ ragContext: "", ragSources: [] });
  });

  test("formats a single chunk with a [1] marker and source attribution", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({
        id: "uuid-1",
        source: "Cancer Council Australia",
        content: "HPV is a common virus.",
      }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "What is HPV?" });

    expect(result.ragContext).toBe("[1] (Cancer Council Australia) HPV is a common virus.");
    expect(result.ragSources).toEqual([
      {
        id: "1",
        title: "Cancer Council Australia",
        chunkId: "uuid-1",
      },
    ]);
  });

  test("formats multiple chunks with sequential markers and blank-line separators", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "uuid-1", source: "A", content: "First chunk content." }),
      chunk({ id: "uuid-2", source: "B", content: "Second chunk content." }),
      chunk({ id: "uuid-3", source: "C", content: "Third chunk content." }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragContext).toBe(
      "[1] (A) First chunk content.\n\n[2] (B) Second chunk content.\n\n[3] (C) Third chunk content."
    );
    expect(result.ragSources.map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(result.ragSources.map((s) => s.chunkId)).toEqual(["uuid-1", "uuid-2", "uuid-3"]);
  });

  test("falls back to '(unknown source)' for chunks with null source", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "uuid-1", source: null, content: "Sourceless content." }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragContext).toBe("[1] Sourceless content.");
    expect(result.ragSources[0]).toEqual({
      id: "1",
      title: "(unknown source)",
      chunkId: "uuid-1",
    });
  });

  test("extracts url from metadata.url when present", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({
        id: "uuid-1",
        source: "Cancer Council",
        metadata: { url: "https://example.com/hpv", page: 3 },
      }),
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragSources[0].url).toBe("https://example.com/hpv");
  });

  test("omits url field when metadata is null or metadata.url is missing/non-string", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "u1", metadata: null }),
      chunk({ id: "u2", metadata: { page: 1 } }),
      chunk({ id: "u3", metadata: { url: 123 } }), // non-string url
    ]);

    const result = await runRagAgent(fakeSupabase, { userMessage: "anything" });

    expect(result.ragSources[0].url).toBeUndefined();
    expect(result.ragSources[1].url).toBeUndefined();
    expect(result.ragSources[2].url).toBeUndefined();
  });

  test("propagates errors from embedText", async () => {
    vi.mocked(embedText).mockRejectedValue(new Error("embed failed"));

    await expect(runRagAgent(fakeSupabase, { userMessage: "anything" })).rejects.toThrow(
      "embed failed"
    );
  });

  test("propagates errors from retrieveChunks", async () => {
    vi.mocked(retrieveChunks).mockRejectedValue(new Error("retrieve failed"));

    await expect(runRagAgent(fakeSupabase, { userMessage: "anything" })).rejects.toThrow(
      "retrieve failed"
    );
  });
});
