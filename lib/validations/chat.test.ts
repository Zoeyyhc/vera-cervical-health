import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "./chat";

describe("chatRequestSchema", () => {
  it("accepts a valid message", () => {
    const result = chatRequestSchema.safeParse({ message: "Hi there" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    const result = chatRequestSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a message over 4000 chars", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(4001) });
    expect(result.success).toBe(false);
  });

  it("accepts a message of exactly 4000 chars", () => {
    const result = chatRequestSchema.safeParse({ message: "x".repeat(4000) });
    expect(result.success).toBe(true);
  });

  it("rejects a missing message field", () => {
    const result = chatRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-string message", () => {
    const result = chatRequestSchema.safeParse({ message: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object body", () => {
    const result = chatRequestSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("accepts a valid UUID sessionId", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hi",
      sessionId: "c3aab8b6-3a89-4dc1-9bbb-dca08fee48f4",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a body without sessionId (optional)", () => {
    const result = chatRequestSchema.safeParse({ message: "Hi" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID sessionId", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hi",
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
