// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { listPendingCandidates } from "./candidates";

function fakeAdmin(rows: unknown[], error: unknown = null) {
  const order2 = vi.fn().mockResolvedValue({ data: rows, error });
  const order1 = vi.fn().mockReturnValue({ order: order2 });
  const eq = vi.fn().mockReturnValue({ order: order1 });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from }, from, select, eq };
}

describe("listPendingCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  test("selects pending candidates and returns the rows", async () => {
    const rows = [{ id: "c1", status: "pending" }];
    const { client, from, eq } = fakeAdmin(rows);

    const out = await listPendingCandidates(client as never);

    expect(from).toHaveBeenCalledWith("knowledge_candidates");
    expect(eq).toHaveBeenCalledWith("status", "pending");
    expect(out).toBe(rows);
  });

  test("throws on a query error", async () => {
    const { client } = fakeAdmin([], { message: "boom" });
    await expect(listPendingCandidates(client as never)).rejects.toThrow("boom");
  });
});
