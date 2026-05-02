// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { type RetrievedChunk, retrieveChunks } from "./retrieve";

type RpcRow = {
  id: string;
  source: string | null;
  content: string;
  similarity_score: number;
  metadata: unknown;
};

function mockSupabaseRpc(data: RpcRow[] | null, error: Error | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const supabase = { rpc } as unknown as Parameters<typeof retrieveChunks>[0];
  return { supabase, rpc };
}

describe("retrieveChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls match_knowledge_chunks with default threshold 0.75 and count 5", async () => {
    const { supabase, rpc } = mockSupabaseRpc([]);
    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);

    await retrieveChunks(supabase, queryEmbedding);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.75,
      match_count: 5,
    });
  });

  test("respects custom threshold and count via opts", async () => {
    const { supabase, rpc } = mockSupabaseRpc([]);
    const queryEmbedding = [0.1, 0.2];

    await retrieveChunks(supabase, queryEmbedding, { threshold: 0.5, count: 10 });

    expect(rpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 10,
    });
  });

  test("maps RPC rows to RetrievedChunk shape (snake_case → camelCase)", async () => {
    const { supabase } = mockSupabaseRpc([
      {
        id: "c1",
        source: "Cancer Council",
        content: "HPV is...",
        similarity_score: 0.92,
        metadata: { page: 1 },
      },
      {
        id: "c2",
        source: "WHO",
        content: "Cervical screening...",
        similarity_score: 0.83,
        metadata: null,
      },
    ]);

    const result: RetrievedChunk[] = await retrieveChunks(supabase, [0.1]);

    expect(result).toEqual([
      {
        id: "c1",
        source: "Cancer Council",
        content: "HPV is...",
        similarityScore: 0.92,
        metadata: { page: 1 },
      },
      {
        id: "c2",
        source: "WHO",
        content: "Cervical screening...",
        similarityScore: 0.83,
        metadata: null,
      },
    ]);
  });

  test("returns an empty array when the RPC returns no rows", async () => {
    const { supabase } = mockSupabaseRpc([]);
    const result = await retrieveChunks(supabase, [0.1]);
    expect(result).toEqual([]);
  });

  test("returns an empty array when the RPC returns null data", async () => {
    const { supabase } = mockSupabaseRpc(null);
    const result = await retrieveChunks(supabase, [0.1]);
    expect(result).toEqual([]);
  });

  test("throws when the RPC returns an error", async () => {
    const { supabase } = mockSupabaseRpc(null, new Error("rpc exploded"));
    await expect(retrieveChunks(supabase, [0.1])).rejects.toThrow("rpc exploded");
  });
});
