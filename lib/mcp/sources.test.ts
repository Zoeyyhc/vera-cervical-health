import { describe, expect, it, vi } from "vitest";
import {
  type TrustedSource,
  hostMatches,
  hostOf,
  loadApprovedSources,
  matchSource,
  verificationForClass,
} from "./sources";

/**
 * The source allowlist is what makes acceptance criterion 4 hold: "A request
 * containing a non-approved source URL cannot cause the MCP to fetch or return
 * that source."
 */

function source(overrides: Partial<TrustedSource> = {}): TrustedSource {
  return {
    id: "s1",
    organisation: "Test Org",
    canonicalHost: "health.gov.au",
    sourceClass: "commonwealth_health_authority",
    jurisdiction: "AU",
    permittedContent: ["health_content"],
    reviewedAt: "2026-08-01T00:00:00Z",
    approvedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("hostOf", () => {
  it("extracts and lowercases the host, dropping www", () => {
    expect(hostOf("https://WWW.Health.GOV.au/some/page")).toBe("health.gov.au");
  });

  it.each([
    ["not a URL", "just some text"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<h1>hi</h1>"],
    ["a file URL", "file:///etc/passwd"],
    ["an empty string", ""],
  ])("returns null for %s", (_label, url) => {
    expect(hostOf(url)).toBeNull();
  });
});

describe("hostMatches", () => {
  it("matches exactly and on subdomains", () => {
    expect(hostMatches("health.gov.au", "health.gov.au")).toBe(true);
    expect(hostMatches("www.health.gov.au", "health.gov.au")).toBe(true);
    expect(hostMatches("beta.api.health.gov.au", "health.gov.au")).toBe(true);
  });

  it("does not match a look-alike suffix", () => {
    // The dot in the suffix check is the whole point.
    expect(hostMatches("evilhealth.gov.au", "health.gov.au")).toBe(false);
    expect(hostMatches("health.gov.au.attacker.com", "health.gov.au")).toBe(false);
    expect(hostMatches("nothealth.gov.au", "health.gov.au")).toBe(false);
  });
});

describe("matchSource", () => {
  const sources = [
    source({ id: "s-health", canonicalHost: "health.gov.au" }),
    source({ id: "s-screening", canonicalHost: "cancerscreening.gov.au" }),
    source({ id: "s-hd", canonicalHost: "healthdirect.gov.au" }),
  ];

  it("finds the owning source", () => {
    expect(matchSource("https://www.health.gov.au/x", sources)?.id).toBe("s-health");
    expect(matchSource("https://healthdirect.gov.au/y", sources)?.id).toBe("s-hd");
  });

  it("returns null for a URL no registry entry claims", () => {
    expect(matchSource("https://www.who.int/fact-sheet", sources)).toBeNull();
    expect(matchSource("https://attacker.example.com/health.gov.au", sources)).toBeNull();
  });

  it("returns null for an unparseable URL", () => {
    expect(matchSource("health.gov.au", sources)).toBeNull();
  });

  it("prefers the most specific registration", () => {
    const nested = [
      source({ id: "s-broad", canonicalHost: "gov.au" }),
      source({ id: "s-narrow", canonicalHost: "health.gov.au" }),
    ];
    expect(matchSource("https://health.gov.au/page", nested)?.id).toBe("s-narrow");
  });
});

describe("verificationForClass", () => {
  it("labels government bodies as an official source", () => {
    expect(verificationForClass("commonwealth_health_authority")).toBe("official_source");
    expect(verificationForClass("state_health_authority")).toBe("official_source");
  });

  it("labels everything else as a clinical non-profit", () => {
    expect(verificationForClass("clinical_nonprofit")).toBe("clinical_nonprofit");
    expect(verificationForClass("directory_provider")).toBe("clinical_nonprofit");
    expect(verificationForClass("event_organiser")).toBe("clinical_nonprofit");
  });
});

describe("loadApprovedSources", () => {
  it("filters to approved rows permitted for the requested usage", async () => {
    const contains = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ contains });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ select }) };

    // biome-ignore lint/suspicious/noExplicitAny: minimal query-builder stub
    await loadApprovedSources(supabase as any, "events");

    expect(supabase.from).toHaveBeenCalledWith("trusted_sources");
    expect(eq).toHaveBeenCalledWith("status", "approved");
    expect(contains).toHaveBeenCalledWith("permitted_content", ["events"]);
  });

  it("throws when the query errors", async () => {
    const contains = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ contains }) }) }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal query-builder stub
    await expect(loadApprovedSources(supabase as any, "directory")).rejects.toThrow("boom");
  });
});
