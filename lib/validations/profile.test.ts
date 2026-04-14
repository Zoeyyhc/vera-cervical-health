import { describe, expect, it } from "vitest";
import { passwordSchema, profileInfoSchema } from "./profile";

describe("profileInfoSchema", () => {
  it("accepts a valid display name", () => {
    const result = profileInfoSchema.safeParse({ displayName: "Alice" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
    }
  });

  it("accepts a single character", () => {
    const result = profileInfoSchema.safeParse({ displayName: "B" });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace on displayName", () => {
    const result = profileInfoSchema.safeParse({ displayName: "  Alice  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
    }
  });

  it("rejects an empty displayName", () => {
    const result = profileInfoSchema.safeParse({ displayName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Display name is required");
      expect(result.error.issues[0].path).toEqual(["displayName"]);
    }
  });

  it("rejects a whitespace-only displayName after trim", () => {
    const result = profileInfoSchema.safeParse({ displayName: "     " });
    expect(result.success).toBe(false);
  });

  it("rejects a displayName longer than 60 characters", () => {
    const result = profileInfoSchema.safeParse({ displayName: "a".repeat(61) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Display name must be 60 characters or fewer");
    }
  });

  it("accepts a displayName of exactly 60 characters", () => {
    const result = profileInfoSchema.safeParse({ displayName: "a".repeat(60) });
    expect(result.success).toBe(true);
  });
});

describe("passwordSchema", () => {
  it("accepts matching 8-character passwords", () => {
    const result = passwordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a 7-character password", () => {
    const result = passwordSchema.safeParse({
      password: "abcd123",
      confirmPassword: "abcd123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password must be at least 8 characters");
      expect(result.error.issues[0].path).toEqual(["password"]);
    }
  });

  it("rejects mismatched confirmation with path confirmPassword", () => {
    const result = passwordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1235",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "confirmPassword");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Passwords do not match");
    }
  });
});
