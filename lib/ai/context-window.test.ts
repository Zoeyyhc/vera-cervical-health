import { describe, expect, it, vi } from "vitest";
import { type ChatHistoryMessage, loadRecentMessages, trimToBudget } from "./context-window";

const u = (content: string): ChatHistoryMessage => ({ role: "user", content });
const a = (content: string): ChatHistoryMessage => ({ role: "assistant", content });

describe("trimToBudget", () => {
  it("returns an empty array unchanged", () => {
    expect(trimToBudget([], 1000)).toEqual([]);
  });

  it("returns the input unchanged when total chars fit the budget", () => {
    const msgs = [u("hi"), a("hello"), u("how are you")];
    // total content chars: 2 + 5 + 11 = 18
    expect(trimToBudget(msgs, 1000)).toEqual(msgs);
  });

  it("returns the input unchanged when total chars equal the budget exactly", () => {
    const msgs = [u("ab"), a("cd"), u("ef")];
    // 2 + 2 + 2 = 6
    expect(trimToBudget(msgs, 6)).toEqual(msgs);
  });

  it("drops oldest messages first when over budget", () => {
    const msgs = [
      u("aaaaaaaaaa"), // 10
      a("bbbbbbbbbb"), // 10
      u("cccccccccc"), // 10
      a("dddddddddd"), // 10
    ];
    // budget 25 → only the last two messages (20 total) fit; trying to add the third-newest
    // (the assistant block) would push to 30 > 25, so we stop.
    const result = trimToBudget(msgs, 25);
    expect(result).toEqual([msgs[2], msgs[3]]);
  });

  it("drops a leading 'assistant' message after trimming so the first role is 'user'", () => {
    const msgs = [
      u("aaaaa"), // 5
      a("bbbbbbbbbb"), // 10
      u("ccccc"), // 5
    ];
    // budget 18 → newest fits (5), next-newest fits (5+10=15), but the original first
    // (user, 5) would push to 20 > 18 → drop it. That leaves [assistant, user]. The leading
    // assistant must be dropped too (Claude requires first role: 'user').
    const result = trimToBudget(msgs, 18);
    expect(result).toEqual([msgs[2]]);
  });

  it("preserves the original order of kept messages", () => {
    const msgs = [u("a"), a("b"), u("c"), a("d"), u("e")];
    const result = trimToBudget(msgs, 100); // all fit
    expect(result).toEqual(msgs);
  });

  it("never returns a result that starts with 'assistant'", () => {
    // Pathological case: only assistant messages.
    const msgs = [a("foo"), a("bar")];
    expect(trimToBudget(msgs, 1000)).toEqual([]);
  });

  it("returns at most one message when budget only fits the newest", () => {
    const msgs = [
      u("aaaaaaaaaa"), // 10
      a("bbbbbbbbbb"), // 10
      u("cccccccccc"), // 10
    ];
    // budget 10 → only the newest (10 chars) fits.
    expect(trimToBudget(msgs, 10)).toEqual([msgs[2]]);
  });
});

function mockSupabaseSelect(
  rows: Array<{ role: string; content: string }> | null,
  error: Error | null = null
) {
  const order = vi.fn().mockResolvedValue({ data: rows, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const supabase = { from } as unknown as Parameters<typeof loadRecentMessages>[0];
  return { supabase, from, select, eq, order };
}

describe("loadRecentMessages", () => {
  it("queries chat_messages by session_id ordered by created_at ASC", async () => {
    const { supabase, from, select, eq, order } = mockSupabaseSelect([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);

    const result = await loadRecentMessages(supabase, "session-x", 1000);

    expect(from).toHaveBeenCalledWith("chat_messages");
    expect(select).toHaveBeenCalledWith("role, content");
    expect(eq).toHaveBeenCalledWith("session_id", "session-x");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("returns an empty array when the session has no messages", async () => {
    const { supabase } = mockSupabaseSelect([]);
    const result = await loadRecentMessages(supabase, "session-empty", 1000);
    expect(result).toEqual([]);
  });

  it("trims to the budget when the history is too large", async () => {
    const { supabase } = mockSupabaseSelect([
      { role: "user", content: "aaaaaaaaaa" }, // 10
      { role: "assistant", content: "bbbbbbbbbb" }, // 10
      { role: "user", content: "cccccccccc" }, // 10
    ]);
    const result = await loadRecentMessages(supabase, "s", 10);
    expect(result).toEqual([{ role: "user", content: "cccccccccc" }]);
  });

  it("uses BUDGET_CHARS by default when no budget is passed", async () => {
    const { supabase } = mockSupabaseSelect([{ role: "user", content: "hi" }]);
    const result = await loadRecentMessages(supabase, "s");
    expect(result).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws if the underlying query errors", async () => {
    const { supabase } = mockSupabaseSelect(null, new Error("db down"));
    await expect(loadRecentMessages(supabase, "s", 1000)).rejects.toThrow("db down");
  });
});
