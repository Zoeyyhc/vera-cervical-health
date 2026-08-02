import { describe, expect, it } from "vitest";
import { melbourneToday, normalizeLocation, resolveVictoriaScope } from "./victoria";

/**
 * Spec §4: Victoria only, with "a clear non-result outside Victoria; it does not
 * silently fall back to nationwide search". The allowlist direction matters —
 * an unrecognised place must resolve to NOT-Victoria.
 */

describe("resolveVictoriaScope", () => {
  it.each([
    ["Melbourne", "suburb"],
    ["Carlton", "suburb"],
    ["St Kilda", "suburb"],
    ["Geelong", "suburb"],
    ["Bendigo", "suburb"],
    ["3000", "postcode"],
    ["3053", "postcode"],
    ["3999", "postcode"],
    ["8000", "postcode"],
    ["Victoria", "statewide"],
    ["VIC", "statewide"],
    ["online", "statewide"],
  ])("treats %s as Victorian", (input, kind) => {
    const scope = resolveVictoriaScope(input);
    expect(scope.inVictoria).toBe(true);
    if (scope.inVictoria) expect(scope.kind).toBe(kind);
  });

  it.each(["Sydney", "Brisbane", "Perth", "Adelaide", "Hobart", "Darwin", "Canberra", "London"])(
    "treats %s as outside Victoria",
    (input) => {
      expect(resolveVictoriaScope(input).inVictoria).toBe(false);
    }
  );

  it.each(["2000", "4000", "5000", "6000", "7000", "0800"])(
    "treats the non-Victorian postcode %s as outside Victoria",
    (postcode) => {
      expect(resolveVictoriaScope(postcode).inVictoria).toBe(false);
    }
  );

  it("accepts an unlisted suburb when it carries an explicit state marker", () => {
    // The locality list can't hold every Victorian suburb; the state marker is
    // what lets the long tail through.
    expect(resolveVictoriaScope("Kangaroo Ground VIC").inVictoria).toBe(true);
    expect(resolveVictoriaScope("Yackandandah, Victoria").inVictoria).toBe(true);
  });

  it("rejects an unlisted suburb with no state marker", () => {
    expect(resolveVictoriaScope("Kangaroo Ground").inVictoria).toBe(false);
  });

  it("lets a postcode override a misleading place name", () => {
    expect(resolveVictoriaScope("Sydney 3000").inVictoria).toBe(true);
    expect(resolveVictoriaScope("Melbourne 2000").inVictoria).toBe(false);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(resolveVictoriaScope("  ST.  KILDA  ").inVictoria).toBe(true);
    expect(resolveVictoriaScope("melbourne").inVictoria).toBe(true);
  });

  it("rejects empty input", () => {
    expect(resolveVictoriaScope("").inVictoria).toBe(false);
    expect(resolveVictoriaScope("   ").inVictoria).toBe(false);
  });
});

describe("normalizeLocation", () => {
  it("strips accents and collapses whitespace", () => {
    expect(normalizeLocation("  Béchervaise   Park ")).toBe("bechervaise park");
  });

  it("drops punctuation rather than keeping it as a token", () => {
    expect(normalizeLocation("St. Kilda, VIC")).toBe("st kilda vic");
  });
});

describe("melbourneToday", () => {
  it("returns an ISO date", () => {
    expect(melbourneToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the Melbourne day, not UTC's", () => {
    // 2026-08-03T22:00Z is already 2026-08-04 in Melbourne (UTC+10).
    expect(melbourneToday(new Date("2026-08-03T22:00:00Z"))).toBe("2026-08-04");
    expect(melbourneToday(new Date("2026-08-03T10:00:00Z"))).toBe("2026-08-03");
  });
});
