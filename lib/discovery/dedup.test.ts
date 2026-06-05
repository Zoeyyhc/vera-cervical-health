// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/rag/retrieve", () => ({ retrieveChunks: vi.fn() }));

import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { DEDUP_THRESHOLD } from "./constants";
import { checkDuplicate } from "./dedup";

const fakeAdmin = {} as never;

describe("checkDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
  });

  test("duplicate when a chunk matches at/above DEDUP_THRESHOLD", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([{ id: "c1" } as never]);
    const r = await checkDuplicate(fakeAdmin, "some extracted content");
    expect(r.duplicate).toBe(true);
    expect(typeof r.contentHash).toBe("string");
    expect(r.contentHash).toHaveLength(64); // sha256 hex
    expect(retrieveChunks).toHaveBeenCalledWith(fakeAdmin, expect.any(Array), {
      threshold: DEDUP_THRESHOLD,
      count: 1,
    });
  });

  test("not a duplicate when no chunk matches", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([]);
    const r = await checkDuplicate(fakeAdmin, "novel content");
    expect(r.duplicate).toBe(false);
  });

  test("identical content yields identical hashes", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([]);
    const a = await checkDuplicate(fakeAdmin, "same");
    const b = await checkDuplicate(fakeAdmin, "same");
    expect(a.contentHash).toBe(b.contentHash);
  });
});
