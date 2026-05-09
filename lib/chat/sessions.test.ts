import { describe, expect, it } from "vitest";
import { deriveSessionTitle } from "./sessions";

describe("deriveSessionTitle", () => {
  it("uses the explicit title when present", () => {
    const out = deriveSessionTitle({ title: "About HPV", firstUserMessage: "ignored" });
    expect(out).toBe("About HPV");
  });

  it("uses the explicit title even when it's a non-empty whitespace-trimmed string", () => {
    const out = deriveSessionTitle({ title: "  My session  ", firstUserMessage: "ignored" });
    expect(out).toBe("My session");
  });

  it("falls back to the first user message when title is null", () => {
    const out = deriveSessionTitle({
      title: null,
      firstUserMessage: "What is the cervix?",
    });
    expect(out).toBe("What is the cervix?");
  });

  it("truncates a long fallback to 60 characters with an ellipsis", () => {
    const longMessage = "a".repeat(80);
    const out = deriveSessionTitle({ title: null, firstUserMessage: longMessage });
    expect(out.length).toBe(61); // 60 chars + "…"
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, 60)).toBe("a".repeat(60));
  });

  it("does NOT truncate a fallback exactly at 60 characters", () => {
    const exactly60 = "b".repeat(60);
    const out = deriveSessionTitle({ title: null, firstUserMessage: exactly60 });
    expect(out).toBe(exactly60);
  });

  it("trims whitespace and newlines from the fallback before truncating", () => {
    const out = deriveSessionTitle({
      title: null,
      firstUserMessage: "\n  hello there\n  ",
    });
    expect(out).toBe("hello there");
  });

  it("falls back to a placeholder when both title and firstUserMessage are absent", () => {
    expect(deriveSessionTitle({ title: null, firstUserMessage: null })).toBe("(new conversation)");
    expect(deriveSessionTitle({ title: null, firstUserMessage: "" })).toBe("(new conversation)");
    expect(deriveSessionTitle({ title: "", firstUserMessage: "" })).toBe("(new conversation)");
  });
});

import { vi } from "vitest";
import { type SessionListItem, loadSessionsForUser } from "./sessions";

/**
 * Mocks the chained query builder used by loadSessionsForUser. The chain is
 *   from(...).select(...).eq(...).order(...).order(...).limit(...)
 * with the embedded chat_messages already pre-filtered/ordered/limited by
 * PostgREST, so each row arrives with at most one user message.
 *
 * Returns spies for every link so tests can assert exactly which arguments
 * were passed at each step.
 */
function mockSupabaseSessionsQuery(
  rows: Array<{
    id: string;
    title: string | null;
    updated_at: string;
    starred_at: string | null;
    chat_messages: Array<{ content: string }>;
  }> | null,
  error: Error | null = null
) {
  // Chain: from → select → eq(role) → is(deleted) → order(embedded) → limit → order(updated) → awaits
  const orderUpdated = vi.fn().mockResolvedValue({ data: rows, error });
  const limit = vi.fn().mockReturnValue({ order: orderUpdated });
  const orderEmbedded = vi.fn().mockReturnValue({ limit });
  const isDeleted = vi.fn().mockReturnValue({ order: orderEmbedded });
  const eqRole = vi.fn().mockReturnValue({ is: isDeleted });
  const select = vi.fn().mockReturnValue({ eq: eqRole });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as Parameters<typeof loadSessionsForUser>[0];
  return { supabase, from, select, eqRole, isDeleted, orderEmbedded, orderUpdated, limit };
}

describe("loadSessionsForUser", () => {
  it("issues a single query that filters embedded chat_messages to role=user, excludes soft-deleted sessions, and orders by updated_at desc", async () => {
    const { supabase, from, select, eqRole, isDeleted, orderEmbedded, orderUpdated, limit } =
      mockSupabaseSessionsQuery([]);

    await loadSessionsForUser(supabase);

    expect(from).toHaveBeenCalledWith("chat_sessions");
    expect(select).toHaveBeenCalledWith(
      expect.stringMatching(
        /id,\s*title,\s*updated_at,\s*starred_at,\s*chat_messages\s*\(\s*content\s*\)/
      )
    );
    expect(eqRole).toHaveBeenCalledWith("chat_messages.role", "user");
    expect(isDeleted).toHaveBeenCalledWith("deleted_at", null);
    expect(orderEmbedded).toHaveBeenCalledWith(
      "created_at",
      expect.objectContaining({ referencedTable: "chat_messages", ascending: true })
    );
    expect(limit).toHaveBeenCalledWith(1, { referencedTable: "chat_messages" });
    expect(orderUpdated).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("groups starred and recent sessions, ordered correctly within each group", async () => {
    // Rows arrive from PostgREST already ordered by updated_at desc — the
    // loader is responsible for grouping (starred vs recent) and sorting
    // starred by starred_at desc, but it relies on PostgREST for the
    // recent-list ordering.
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s2",
        title: "New recent",
        updated_at: "2026-05-09T10:00:00Z",
        starred_at: null,
        chat_messages: [{ content: "new" }],
      },
      {
        id: "s1",
        title: "Old recent",
        updated_at: "2026-05-01T10:00:00Z",
        starred_at: null,
        chat_messages: [{ content: "old" }],
      },
      {
        id: "s4",
        title: "Newer star",
        updated_at: "2026-04-02T10:00:00Z",
        starred_at: "2026-05-08T10:00:00Z",
        chat_messages: [{ content: "newer star" }],
      },
      {
        id: "s3",
        title: "Older star",
        updated_at: "2026-04-01T10:00:00Z",
        starred_at: "2026-04-15T10:00:00Z",
        chat_messages: [{ content: "older star" }],
      },
    ]);

    const result = await loadSessionsForUser(supabase);

    // Starred: sorted by starred_at desc (loader's responsibility)
    expect(result.starred.map((s) => s.id)).toEqual(["s4", "s3"]);
    // Recent: PostgREST order preserved (updated_at desc)
    expect(result.recent.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("derives the display title from the embedded user message when title is null", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        starred_at: null,
        chat_messages: [{ content: "Hello" }],
      },
    ]);

    const result = await loadSessionsForUser(supabase);

    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]).toMatchObject({
      id: "s1",
      displayTitle: "Hello",
      updatedAt: "2026-05-01T10:00:00Z",
      starredAt: null,
    });
  });

  it("returns empty groups when the user has no sessions", async () => {
    const { supabase } = mockSupabaseSessionsQuery([]);
    const result = await loadSessionsForUser(supabase);
    expect(result).toEqual({ starred: [], recent: [] });
  });

  it("throws if the underlying query errors", async () => {
    const { supabase } = mockSupabaseSessionsQuery(null, new Error("db down"));
    await expect(loadSessionsForUser(supabase)).rejects.toThrow("db down");
  });
});
