import { describe, expect, it } from "vitest";
import { type ChatHistoryMessage, trimToBudget } from "./context-window";

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
