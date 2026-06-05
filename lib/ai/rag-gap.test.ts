// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/ai/audit-context", () => ({
  auditContext: { get: vi.fn() },
}));

import { auditContext } from "@/lib/ai/audit-context";
import { GAP_THRESHOLD, recordRagGap } from "./rag-gap";

function fakeCtx(insert = vi.fn().mockResolvedValue({ error: null })) {
  return {
    supabaseAdmin: { from: vi.fn().mockReturnValue({ insert }) },
    userId: "user-1",
    sessionId: "session-1",
  };
}

describe("GAP_THRESHOLD", () => {
  test("is 0.52 (coverage threshold, decoupled from the 0.45 retrieval floor)", () => {
    expect(GAP_THRESHOLD).toBe(0.52);
  });
});

describe("recordRagGap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("no-op when there is no audit context", async () => {
    vi.mocked(auditContext.get).mockReturnValue(undefined);

    await expect(recordRagGap({ question: "q", topScore: 0.1 })).resolves.toBeUndefined();
  });

  test("inserts a rag_gap analytics event with user_id and payload", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(auditContext.get).mockReturnValue(fakeCtx(insert) as never);

    await recordRagGap({ question: "What is HPV?", topScore: 0.31 });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      event_type: "rag_gap",
      payload: { question: "What is HPV?", top_score: 0.31 },
    });
  });

  test("truncates the question to 200 chars", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(auditContext.get).mockReturnValue(fakeCtx(insert) as never);

    await recordRagGap({ question: "x".repeat(500), topScore: 0 });

    const payload = insert.mock.calls[0][0].payload as { question: string };
    expect(payload.question).toHaveLength(200);
  });

  test("never throws when the insert returns an error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    vi.mocked(auditContext.get).mockReturnValue(fakeCtx(insert) as never);

    await expect(recordRagGap({ question: "q", topScore: 0 })).resolves.toBeUndefined();
  });
});
