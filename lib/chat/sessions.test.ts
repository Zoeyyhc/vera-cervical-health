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

function mockSupabaseSessionsQuery(
  rows: Array<{
    id: string;
    title: string | null;
    updated_at: string;
    chat_messages: Array<{ content: string; role: string; created_at: string }>;
  }> | null,
  error: Error | null = null
) {
  const order = vi.fn().mockResolvedValue({ data: rows, error });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as Parameters<typeof loadSessionsForUser>[0];
  return { supabase, from, select, order };
}

describe("loadSessionsForUser", () => {
  it("queries chat_sessions with nested chat_messages, ordered by updated_at desc", async () => {
    const { supabase, from, select, order } = mockSupabaseSessionsQuery([]);

    await loadSessionsForUser(supabase);

    expect(from).toHaveBeenCalledWith("chat_sessions");
    expect(select).toHaveBeenCalledWith(
      expect.stringMatching(/id,\s*title,\s*updated_at,\s*chat_messages\s*\(/)
    );
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("derives the display title from the first user message when title is null", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [
          { content: "Hello", role: "user", created_at: "2026-05-01T09:00:00Z" },
          { content: "Hi there!", role: "assistant", created_at: "2026-05-01T09:00:01Z" },
        ],
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
        chat_messages: [{ content: "ignored", role: "user", created_at: "2026-05-01T09:00:00Z" }],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("My pinned chat");
  });

  it("uses the placeholder when there are no messages and no title", async () => {
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

  it("ignores assistant messages when picking the first message", async () => {
    const { supabase } = mockSupabaseSessionsQuery([
      {
        id: "s1",
        title: null,
        updated_at: "2026-05-01T10:00:00Z",
        chat_messages: [
          {
            content: "should be skipped",
            role: "assistant",
            created_at: "2026-05-01T09:00:00Z",
          },
          {
            content: "the real first user msg",
            role: "user",
            created_at: "2026-05-01T09:00:01Z",
          },
        ],
      },
    ]);
    const result = await loadSessionsForUser(supabase);
    expect(result[0].displayTitle).toBe("the real first user msg");
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
