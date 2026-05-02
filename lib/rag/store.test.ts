// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({
  embedText: vi.fn(),
}));

import { embedText } from "@/lib/rag/embed";
import { EMBED_CONCURRENCY, ingestDocument } from "./store";

type InsertedRow = {
  source: string | null;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown> | undefined;
};

/**
 * Build a Supabase mock that records the rows passed to `.insert([...])` and
 * returns canned ids from `.select("id")`. The insert call returns the chain
 * object; `.select("id")` resolves with `{ data, error }`.
 */
function mockSupabaseInsert(
  opts: {
    ids?: string[];
    insertError?: { message: string } | null;
  } = {}
) {
  const insertedRows: InsertedRow[] = [];
  const insert = vi.fn((rows: InsertedRow[]) => {
    insertedRows.push(...rows);
    return {
      select: vi.fn(() =>
        Promise.resolve(
          opts.insertError
            ? { data: null, error: opts.insertError }
            : {
                data: (opts.ids ?? rows.map((_, i) => `id-${i + 1}`)).map((id) => ({ id })),
                error: null,
              }
        )
      ),
    };
  });
  const from = vi.fn((table: string) => {
    if (table !== "knowledge_chunks") throw new Error(`unexpected table: ${table}`);
    return { insert };
  });
  const supabase = { from } as unknown as Parameters<typeof ingestDocument>[0];
  return { supabase, insertedRows, insert, from };
}

function fakeEmbedding(seed = 0.1): number[] {
  return Array.from({ length: 1536 }, () => seed);
}

describe("ingestDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockImplementation(async () => fakeEmbedding());
  });

  test("returns an empty result and makes no API/DB calls when content is empty", async () => {
    const { supabase, from } = mockSupabaseInsert();

    const result = await ingestDocument(supabase, { content: "", source: "Doc A" });

    expect(result).toEqual({ chunkIds: [] });
    expect(embedText).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("embeds a single small chunk and inserts one row", async () => {
    const { supabase, insertedRows, insert } = mockSupabaseInsert({ ids: ["uuid-1"] });
    vi.mocked(embedText).mockResolvedValueOnce(fakeEmbedding(0.42));

    const result = await ingestDocument(supabase, {
      content: "HPV is a common virus.",
      source: "Cancer Council Australia",
    });

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText).toHaveBeenCalledWith("HPV is a common virus.");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertedRows).toEqual([
      {
        source: "Cancer Council Australia",
        content: "HPV is a common virus.",
        embedding: fakeEmbedding(0.42),
        metadata: undefined,
      },
    ]);
    expect(result).toEqual({ chunkIds: ["uuid-1"] });
  });

  test("chunks long content, embeds each, inserts all rows in a single call", async () => {
    // 5000 chars > default 2048-char chunk size → multiple chunks
    const longContent = "a".repeat(5000);
    const { supabase, insertedRows, insert } = mockSupabaseInsert();

    let embedCallIndex = 0;
    vi.mocked(embedText).mockImplementation(async () => fakeEmbedding(embedCallIndex++ / 10));

    const result = await ingestDocument(supabase, {
      content: longContent,
      source: "Long Doc",
    });

    expect(vi.mocked(embedText).mock.calls.length).toBeGreaterThan(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertedRows.length).toBe(vi.mocked(embedText).mock.calls.length);
    expect(result.chunkIds.length).toBe(insertedRows.length);

    insertedRows.forEach((row, i) => {
      expect(row.source).toBe("Long Doc");
      expect(row.content).toBe(vi.mocked(embedText).mock.calls[i][0]);
      expect(row.embedding).toEqual(fakeEmbedding(i / 10));
    });
  });

  test("passes metadata through to every inserted row", async () => {
    const longContent = "b".repeat(5000);
    const { supabase, insertedRows } = mockSupabaseInsert();
    const metadata = { page: 3, license: "CC-BY-4.0" };

    await ingestDocument(supabase, {
      content: longContent,
      source: "WHO",
      metadata,
    });

    expect(insertedRows.length).toBeGreaterThan(1);
    for (const row of insertedRows) {
      expect(row.metadata).toEqual(metadata);
    }
  });

  test("respects EMBED_CONCURRENCY — never more than the cap in flight at once", async () => {
    // 12 chunks worth of content → batches of 5, 5, 2 with cap = 5
    const longContent = "c".repeat(2048 * 12);
    const { supabase } = mockSupabaseInsert();

    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(embedText).mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield to the event loop so other started embeds can register inFlight
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return fakeEmbedding();
    });

    await ingestDocument(supabase, { content: longContent, source: "S" });

    expect(vi.mocked(embedText).mock.calls.length).toBeGreaterThan(EMBED_CONCURRENCY);
    expect(maxInFlight).toBeLessThanOrEqual(EMBED_CONCURRENCY);
  });

  test("propagates errors from embedText (no insert called)", async () => {
    const { supabase, from } = mockSupabaseInsert();
    vi.mocked(embedText).mockRejectedValueOnce(new Error("openai down"));

    await expect(ingestDocument(supabase, { content: "anything", source: "X" })).rejects.toThrow(
      "openai down"
    );

    expect(from).not.toHaveBeenCalled();
  });

  test("throws when the insert returns an error", async () => {
    const { supabase } = mockSupabaseInsert({ insertError: { message: "rls denied" } });

    await expect(ingestDocument(supabase, { content: "anything", source: "X" })).rejects.toThrow(
      "rls denied"
    );
  });
});
