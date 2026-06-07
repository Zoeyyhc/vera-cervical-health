// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/rag/store", () => ({ ingestDocument: vi.fn() }));
vi.mock("@/lib/rag/documents", () => ({ deleteKnowledgeDocument: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteKnowledgeDocument } from "@/lib/rag/documents";
import { ingestDocument } from "@/lib/rag/store";
import { revalidatePath } from "next/cache";
import { addDocument, deleteDocument } from "./document-actions";

const client = { from: vi.fn() };

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: client as never,
    user: { id: "admin1" } as never,
  });
}

describe("addDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  test("ingests with source=name and manual metadata, returns chunk count", async () => {
    asAdmin();
    vi.mocked(ingestDocument).mockResolvedValue({ chunkIds: ["a", "b", "c"] });

    const result = await addDocument({ name: "My doc", content: "Hello world" });

    expect(ingestDocument).toHaveBeenCalledWith(client, {
      source: "My doc",
      content: "Hello world",
      metadata: { title: "My doc", origin: "manual" },
    });
    expect(result).toEqual({ chunksCreated: 3 });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/knowledge/documents");
  });

  test("rejects empty content before any admin/DB work", async () => {
    await expect(addDocument({ name: "x", content: "   " })).rejects.toThrow();
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  test("rejects empty name", async () => {
    await expect(addDocument({ name: "  ", content: "real content" })).rejects.toThrow();
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  test("rejects content over 512KB", async () => {
    const tooBig = "a".repeat(512_001);
    await expect(addDocument({ name: "big", content: tooBig })).rejects.toThrow();
    expect(ingestDocument).not.toHaveBeenCalled();
  });
});

describe("deleteDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deletes the named document and revalidates", async () => {
    asAdmin();
    await deleteDocument("who.int/hpv");
    expect(deleteKnowledgeDocument).toHaveBeenCalledWith(client, "who.int/hpv");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/knowledge/documents");
  });

  test("accepts null (the unsourced group)", async () => {
    asAdmin();
    await deleteDocument(null);
    expect(deleteKnowledgeDocument).toHaveBeenCalledWith(client, null);
  });
});
