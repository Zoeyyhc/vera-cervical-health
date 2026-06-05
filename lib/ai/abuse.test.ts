import { recordAbuseEvent } from "@/lib/ai/abuse";
import { auditContext } from "@/lib/ai/audit-context";
import { beforeEach, describe, expect, it, vi } from "vitest";

function fakeAdmin() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  // biome-ignore lint/suspicious/noExplicitAny: test fixture, not a real client
  return { client: { from } as any, from, insert };
}

describe("recordAbuseEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a row with context ids and the event type", async () => {
    const { client, from, insert } = fakeAdmin();
    await auditContext.run({ supabaseAdmin: client, userId: "u-1", sessionId: "s-1" }, () =>
      recordAbuseEvent({ type: "injection_attempt", messageExcerpt: "hi" })
    );
    expect(from).toHaveBeenCalledWith("abuse_events");
    expect(insert).toHaveBeenCalledWith({
      user_id: "u-1",
      session_id: "s-1",
      type: "injection_attempt",
      message_excerpt: "hi",
    });
  });

  it("truncates message_excerpt to 200 chars", async () => {
    const { client, insert } = fakeAdmin();
    const long = "a".repeat(500);
    await auditContext.run({ supabaseAdmin: client, userId: null, sessionId: null }, () =>
      recordAbuseEvent({ type: "injection_attempt", messageExcerpt: long })
    );
    expect(insert.mock.calls[0][0].message_excerpt).toHaveLength(200);
  });

  it("is a no-op when there is no audit context", async () => {
    // Outside auditContext.run — must not throw.
    await expect(
      recordAbuseEvent({ type: "injection_attempt", messageExcerpt: "x" })
    ).resolves.toBeUndefined();
  });
});
