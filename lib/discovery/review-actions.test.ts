// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/rag/store", () => ({ ingestDocument: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { ingestDocument } from "@/lib/rag/store";
import { revalidatePath } from "next/cache";
import { approveCandidate, rejectCandidate } from "./review-actions";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

/** Fake admin client: candidate select→eq→single, and update→eq. */
function fakeAdmin(candidate: unknown) {
  const single = vi.fn().mockResolvedValue({ data: candidate, error: null });
  const selectEq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const client = { from: vi.fn().mockReturnValue({ select, update }) };
  return { client, update, updateEq };
}

const candidate = {
  source_url: "https://who.int/hpv",
  title: "HPV",
  raw_content: "HPV is common.",
  authority_score: 0.95,
  domain_tags: ["hpv-vaccine"],
  gap_refs: ["g1"],
  created_at: "2026-06-01T00:00:00.000Z",
  status: "pending",
};

describe("approveCandidate", () => {
  beforeEach(() => vi.clearAllMocks());

  test("ingests the candidate and marks it approved", async () => {
    const { client, update } = fakeAdmin(candidate);
    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: client as never,
      user: { id: "admin1" } as never,
    });

    await approveCandidate(VALID_ID);

    expect(ingestDocument).toHaveBeenCalledWith(client, {
      content: "HPV is common.",
      source: "https://who.int/hpv",
      metadata: {
        url: "https://who.int/hpv",
        title: "HPV",
        authorityScore: 0.95,
        discoveredAt: "2026-06-01T00:00:00.000Z",
        gapRefs: ["g1"],
        domainTags: ["hpv-vaccine"],
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", reviewed_by: "admin1" })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/knowledge");
  });

  test("is idempotent — does nothing when the candidate isn't pending", async () => {
    const { client, update } = fakeAdmin({ ...candidate, status: "approved" });
    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: client as never,
      user: { id: "admin1" } as never,
    });

    await approveCandidate(VALID_ID);

    expect(ingestDocument).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test("rejects an invalid id before any DB work", async () => {
    await expect(approveCandidate("not-a-uuid")).rejects.toThrow();
    expect(requireAdmin).not.toHaveBeenCalled();
  });
});

describe("rejectCandidate", () => {
  beforeEach(() => vi.clearAllMocks());

  test("marks the candidate rejected", async () => {
    const { client, update } = fakeAdmin(candidate);
    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: client as never,
      user: { id: "admin1" } as never,
    });

    await rejectCandidate(VALID_ID);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", reviewed_by: "admin1" })
    );
    expect(ingestDocument).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/knowledge");
  });
});
