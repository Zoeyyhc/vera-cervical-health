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
