import { describe, expect, it } from "vitest";
import { LOCALES, type Locale, passwordSchema, profileInfoSchema } from "./profile";

describe("LOCALES", () => {
  it("contains exactly en and zh", () => {
    expect(LOCALES).toEqual(["en", "zh"]);
  });
});

describe("profileInfoSchema", () => {
  it("accepts a valid English profile", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "Alice",
      locale: "en",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
      expect(result.data.locale).toBe("en");
    }
  });

  it("accepts a valid Chinese profile", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "B",
      locale: "zh",
    });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace on displayName", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "  Alice  ",
      locale: "en",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alice");
    }
  });

  it("rejects an empty displayName", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "",
      locale: "en",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Display name is required");
      expect(result.error.issues[0].path).toEqual(["displayName"]);
    }
  });

  it("rejects a whitespace-only displayName after trim", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "     ",
      locale: "en",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a displayName longer than 60 characters", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "a".repeat(61),
      locale: "en",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Display name must be 60 characters or fewer");
    }
  });

  it("accepts a displayName of exactly 60 characters", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "a".repeat(60),
      locale: "en",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown locale", () => {
    const result = profileInfoSchema.safeParse({
      displayName: "Alice",
      locale: "fr" as unknown as Locale,
    });
    expect(result.success).toBe(false);
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
