import { describe, expect, it } from "vitest";
import {
  findScreeningServicesInput,
  listVerifiedEventsInput,
  searchHealthInfoInput,
} from "./schemas";

/**
 * The tool inputs are the MCP's outer boundary. Spec §5: "Inputs are bounded and
 * never accept a URL, host name, raw HTTP options, or an arbitrary source
 * selector." These tests pin that down — acceptance criterion 4 depends on it.
 */

describe("searchHealthInfoInput", () => {
  it("accepts a plain query", () => {
    expect(searchHealthInfoInput.safeParse({ query: "when should I get screened" }).success).toBe(
      true
    );
  });

  it("accepts a known topic and rejects an unknown one", () => {
    expect(searchHealthInfoInput.safeParse({ query: "hpv", topic: "vaccination" }).success).toBe(
      true
    );
    expect(searchHealthInfoInput.safeParse({ query: "hpv", topic: "diagnosis" }).success).toBe(
      false
    );
  });

  it("bounds the query length at both ends", () => {
    expect(searchHealthInfoInput.safeParse({ query: "a" }).success).toBe(false);
    expect(searchHealthInfoInput.safeParse({ query: "x".repeat(301) }).success).toBe(false);
    expect(searchHealthInfoInput.safeParse({ query: "x".repeat(300) }).success).toBe(true);
  });

  it("rejects an unknown key, so no source selector can be smuggled in", () => {
    const result = searchHealthInfoInput.safeParse({
      query: "hpv",
      sourceUrl: "https://attacker.example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("findScreeningServicesInput", () => {
  it("accepts a suburb and a postcode", () => {
    expect(findScreeningServicesInput.safeParse({ location: "Carlton" }).success).toBe(true);
    expect(findScreeningServicesInput.safeParse({ location: "3053" }).success).toBe(true);
    expect(findScreeningServicesInput.safeParse({ location: "St Kilda" }).success).toBe(true);
  });

  it.each([
    ["a full URL", "https://attacker.example.com"],
    ["a scheme-relative URL", "//attacker.example.com"],
    ["a bare host", "attacker.example.com?q=1"],
    ["an at-sign redirect", "carlton@attacker.example.com"],
    ["angle-bracket markup", "<script>alert(1)</script>"],
  ])("rejects %s as a location", (_label, location) => {
    expect(findScreeningServicesInput.safeParse({ location }).success).toBe(false);
  });

  it("rejects an unknown preference key", () => {
    const result = findScreeningServicesInput.safeParse({
      location: "Carlton",
      preferences: { selfCollection: true, fetchUrl: "https://attacker.example.com" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts the documented preferences", () => {
    const result = findScreeningServicesInput.safeParse({
      location: "Carlton",
      preferences: { selfCollection: true, accessibility: false, language: "Vietnamese" },
    });
    expect(result.success).toBe(true);
  });
});

describe("listVerifiedEventsInput", () => {
  it("accepts an empty input — statewide and online events need no location", () => {
    expect(listVerifiedEventsInput.safeParse({}).success).toBe(true);
  });

  it("requires fromDate to be an ISO date", () => {
    expect(listVerifiedEventsInput.safeParse({ fromDate: "2026-08-03" }).success).toBe(true);
    expect(listVerifiedEventsInput.safeParse({ fromDate: "3 August 2026" }).success).toBe(false);
    expect(listVerifiedEventsInput.safeParse({ fromDate: "2026-08-03T00:00:00Z" }).success).toBe(
      false
    );
  });

  it("rejects an unknown topic", () => {
    expect(listVerifiedEventsInput.safeParse({ topic: "anything" }).success).toBe(false);
    expect(listVerifiedEventsInput.safeParse({ topic: "cervical_screening" }).success).toBe(true);
  });
});
