import { describe, expect, it } from "vitest";
import { CROSS_STATE_LOCALITIES, VIC_LOCALITIES } from "./vic-localities.generated";
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

  it("accepts a suburb carrying an explicit state marker", () => {
    expect(resolveVictoriaScope("Kangaroo Ground VIC").inVictoria).toBe(true);
    expect(resolveVictoriaScope("Yackandandah, Victoria").inVictoria).toBe(true);
  });

  it("rejects a place that is in no Victorian gazetteer, state marker or not", () => {
    expect(resolveVictoriaScope("Kangaroo Valley").inVictoria).toBe(false);
    expect(resolveVictoriaScope("Wollongong").inVictoria).toBe(false);
  });

  /**
   * The hand-maintained allowlist this replaced held 183 names, so a real
   * resident of Vermont — a suburb with its own postcode 20km from the CBD —
   * was told we don't cover Victoria. These are the names it missed.
   */
  it.each([
    "Vermont",
    "Vermont South",
    "Bend of Islands",
    "Kangaroo Ground",
    "Yackandandah",
    "Hoppers Crossing",
    "Airport West",
    "Point Cook",
    "Glen Waverley",
    "Burwood East",
    "Brighton East",
    "Tullamarine",
    "Wandin North",
    "Koo Wee Rup",
  ])("recognises the Victorian locality %s", (input) => {
    const scope = resolveVictoriaScope(input);
    expect(scope.inVictoria).toBe(true);
    if (scope.inVictoria) expect(scope.kind).toBe("suburb");
  });

  it.each(["3133", "3151", "3125", "3121"])("recognises the Victorian postcode %s", (input) => {
    const scope = resolveVictoriaScope(input);
    expect(scope.inVictoria).toBe(true);
    if (scope.inVictoria) expect(scope.kind).toBe("postcode");
  });

  it("covers the whole state, not just the metro area the allowlist favoured", () => {
    // A 183-name list was always going to be metro-biased. The dataset is not.
    expect(VIC_LOCALITIES.size).toBeGreaterThan(3000);
  });

  it("excludes localities that exist only in other states", () => {
    for (const name of ["bondi", "parramatta", "toowoomba", "fremantle", "glenelg north"]) {
      expect(VIC_LOCALITIES.has(name)).toBe(false);
    }
  });

  it("excludes mail facilities that are not places", () => {
    // Some of these are typed 'Delivery Area' in the dataset despite naming a
    // post-office counter rather than a suburb, so the type filter alone misses
    // them. 'NORTH POLE, VIC 9999' is a joke row the postcode range catches.
    for (const name of [
      "were street po",
      "domain road po",
      "booran road po",
      "epping dc",
      "geelong mc",
      "north pole",
    ]) {
      expect(VIC_LOCALITIES.has(name)).toBe(false);
    }
    // ...but the suburb an 'Epping DC' row shadows must survive.
    expect(VIC_LOCALITIES.has("epping")).toBe(true);
  });

  it("flags names shared with another state without deciding them", () => {
    // resolveVictoriaScope is the MCP-boundary gate and stays permissive; the
    // agent layer is what refuses to guess. Both halves are asserted here so the
    // split cannot silently collapse into one behaviour.
    for (const name of ["richmond", "brighton", "st kilda", "preston"]) {
      expect(VIC_LOCALITIES.has(name)).toBe(true);
      expect(CROSS_STATE_LOCALITIES.has(name)).toBe(true);
      expect(resolveVictoriaScope(name).inVictoria).toBe(true);
    }
  });

  it("does not flag names unique to Victoria", () => {
    for (const name of ["vermont south", "hoppers crossing", "bend of islands", "koo wee rup"]) {
      expect(CROSS_STATE_LOCALITIES.has(name)).toBe(false);
    }
  });

  // Victoria names a whole class of suburbs "<listed suburb> <compass point>".
  // Requiring each one in the allowlist means a real resident of Burwood East is
  // told we don't cover their area — the worst failure this resolver can produce.
  it.each([
    "Burwood East",
    "Brighton East",
    "Bentleigh East",
    "Doncaster East",
    "Glen Waverley South",
    "Preston West",
    "Ringwood North",
  ])("accepts %s, a compass-suffixed form of a listed locality", (input) => {
    const scope = resolveVictoriaScope(input);
    expect(scope.inVictoria).toBe(true);
    if (scope.inVictoria) expect(scope.kind).toBe("suburb");
  });

  it.each(["North Melbourne", "East Melbourne", "South Melbourne", "Carlton North"])(
    "still accepts %s, which is a listed locality in its own right",
    (input) => {
      expect(resolveVictoriaScope(input).inVictoria).toBe(true);
    }
  );

  it.each(["Bondi East", "Sydney North", "Perth South", "Fremantle West"])(
    "does not accept %s — the compass suffix must not rescue an unlisted base name",
    (input) => {
      expect(resolveVictoriaScope(input).inVictoria).toBe(false);
    }
  );

  it.each(["east", "north", "south west"])("does not accept the bare compass word %s", (input) => {
    expect(resolveVictoriaScope(input).inVictoria).toBe(false);
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
