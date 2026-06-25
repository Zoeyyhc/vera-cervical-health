// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { addManualGap } from "./gap-actions";

function fakeAdmin(insertError: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const from = vi.fn().mockReturnValue({ insert });
  return { supabase: { from }, user: { id: "admin-1" }, from, insert };
}

describe("addManualGap", () => {
  beforeEach(() => vi.clearAllMocks());

  test("inserts a manual rag_gap event attributed to the admin", async () => {
    const ctx = fakeAdmin();
    vi.mocked(requireAdmin).mockResolvedValue(ctx as never);

    await addManualGap("  When is the HPV booster due?  ");

    expect(ctx.from).toHaveBeenCalledWith("analytics_events");
    expect(ctx.insert).toHaveBeenCalledWith({
      user_id: "admin-1",
      event_type: "rag_gap",
      payload: { question: "When is the HPV booster due?", top_score: 0, source: "manual" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/knowledge/gaps");
  });

  test("rejects an empty question without inserting", async () => {
    const ctx = fakeAdmin();
    vi.mocked(requireAdmin).mockResolvedValue(ctx as never);
    await expect(addManualGap("   ")).rejects.toThrow();
    expect(ctx.insert).not.toHaveBeenCalled();
  });

  test("rejects an over-length question (> 200 chars)", async () => {
    const ctx = fakeAdmin();
    vi.mocked(requireAdmin).mockResolvedValue(ctx as never);
    await expect(addManualGap("x".repeat(201))).rejects.toThrow();
    expect(ctx.insert).not.toHaveBeenCalled();
  });

  test("throws when the insert errors", async () => {
    const ctx = fakeAdmin({ message: "rls denied" });
    vi.mocked(requireAdmin).mockResolvedValue(ctx as never);
    await expect(addManualGap("valid question")).rejects.toThrow("rls denied");
  });
});
