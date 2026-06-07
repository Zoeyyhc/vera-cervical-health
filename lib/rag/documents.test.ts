// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { deleteKnowledgeDocument, listKnowledgeDocuments } from "./documents";

describe("listKnowledgeDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls the RPC and maps rows to KnowledgeDocument", async () => {
    const rows = [
      {
        source: "who.int/hpv",
        title: "HPV",
        chunk_count: 8,
        created_at: "2026-05-01T00:00:00.000Z",
      },
      { source: null, title: null, chunk_count: 2, created_at: "2026-04-01T00:00:00.000Z" },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const client = { rpc };

    const out = await listKnowledgeDocuments(client as never);

    expect(rpc).toHaveBeenCalledWith("list_knowledge_documents");
    expect(out).toEqual([
      { source: "who.int/hpv", title: "HPV", chunkCount: 8, createdAt: "2026-05-01T00:00:00.000Z" },
      { source: null, title: null, chunkCount: 2, createdAt: "2026-04-01T00:00:00.000Z" },
    ]);
  });

  test("throws on a query error", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) };
    await expect(listKnowledgeDocuments(client as never)).rejects.toThrow("boom");
  });
});

describe("deleteKnowledgeDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  function fakeDelete(error: unknown = null) {
    const eq = vi.fn().mockResolvedValue({ error });
    const is = vi.fn().mockResolvedValue({ error });
    const del = vi.fn().mockReturnValue({ eq, is });
    const from = vi.fn().mockReturnValue({ delete: del });
    return { client: { from }, from, eq, is };
  }

  test("deletes by source via .eq when source is a string", async () => {
    const { client, from, eq } = fakeDelete();
    await deleteKnowledgeDocument(client as never, "who.int/hpv");
    expect(from).toHaveBeenCalledWith("knowledge_chunks");
    expect(eq).toHaveBeenCalledWith("source", "who.int/hpv");
  });

  test("deletes the unsourced group via .is when source is null", async () => {
    const { client, is } = fakeDelete();
    await deleteKnowledgeDocument(client as never, null);
    expect(is).toHaveBeenCalledWith("source", null);
  });

  test("throws on a delete error", async () => {
    const { client } = fakeDelete({ message: "nope" });
    await expect(deleteKnowledgeDocument(client as never, "x")).rejects.toThrow("nope");
  });
});
