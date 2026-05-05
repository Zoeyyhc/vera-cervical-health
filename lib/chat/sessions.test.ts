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
    chat_messages: Array<{ content: string }>;
  }> | null,
  error: Error | null = null
) {
  // Chain shape: from → select → eq → order(embedded) → limit → order(parent) → awaits
  const orderUpdated = vi.fn().mockResolvedValue({ data: rows, error });
  const limit = vi.fn().mockReturnValue({ order: orderUpdated });
  const orderEmbedded = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order: orderEmbedded });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as Parameters<typeof loadSessionsForUser>[0];
  return { supabase, from, select, eq, orderEmbedded, orderUpdated, limit };
}

describe("loadSessionsForUser", () => {
  it("issues a single query that filters embedded chat_messages to role=user, ordered ascending and limited to 1 per session", async () => {
    const { supabase, from, select, eq, orderEmbedded, orderUpdated, limit } =
      mockSupabaseSessionsQuery([]);

    await loadSessionsForUser(supabase);

    expect(from).toHaveBeenCalledWith("chat_sessions");
    // Only the parent columns plus the bare embedded content — the embedded
    // resource is shaped by the per-resource filter/order/limit modifiers,
    // not by the select string.
    expect(select).toHaveBeenCalledWith(
      expect.stringMatching(/id,\s*title,\s*updated_at,\s*chat_messages\s*\(\s*content\s*\)/)
    );
    expect(eq).toHaveBeenCalledWith("chat_messages.role", "user");
    expect(orderEmbedded).toHaveBeenCalledWith(
      "created_at",
      expect.objectContaining({ referencedTable: "chat_messages", ascending: true })
    );
    expect(limit).toHaveBeenCalledWith(1, { referencedTable: "chat_messages" });
    expect(orderUpdated).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("derives the display title from the (single) embedded user message when title is null", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [{ content: "Hello" }],
      },
    ]);

    const result: SessionListItem[] = await loadSessionsForUser(supabase);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "s1",
      displayTitle: "Hello",
      updatedAt: "2026-05-01T10:00:00Z",
    });
  });

  it("uses the explicit title when present", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: "My pinned chat",
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [{ content: "ignored" }],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("My pinned chat");
  });

  it("uses the placeholder when the embedded message array is empty and title is null", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("(new conversation)");
  });

  it("returns an empty array when the user has no sessions", async () => {
    const { supabase } = mockSupabaseSessionsQuery([]);
    const result = await loadSessionsForUser(supabase);
    expect(result).toEqual([]);
  });

  it("throws if the underlying query errors", async () => {
    const { supabase } = mockSupabaseSessionsQuery(null, new Error("db down"));
    await expect(loadSessionsForUser(supabase)).rejects.toThrow("db down");
  });
});
