import { describe, expect, it } from "vitest";
import { resolveLocation, resolveLocationPhrase } from "./location";

/**
 * The resolver's job is to be honest about *why* it has no Victorian location,
 * because the four reasons need four different replies:
 *
 *   confirmed_vic  → query the MCP
 *   ambiguous      → ask which state, never guess
 *   outside_vic    → explain the scope, do not ask for another suburb
 *   missing/unknown→ ask for a suburb or postcode
 *
 * Collapsing these into one boolean is what produced both of the bugs this
 * replaces: Vermont residents told Victoria was out of scope, and Sydney users
 * told "no events found" as though the search had run.
 */

describe("resolveLocationPhrase", () => {
  describe("names unique to Victoria", () => {
    it.each([
      "vermont",
      "vermont south",
      "burwood east",
      "brighton east",
      "glen waverley",
      "point cook",
      "hoppers crossing",
      "airport west",
      "bend of islands",
    ])("confirms %s from the gazetteer alone", (phrase) => {
      const result = resolveLocationPhrase(phrase);
      expect(result.status).toBe("confirmed_vic");
      if (result.status === "confirmed_vic") {
        expect(result.locality).toBe(phrase);
        expect(result.evidence).toBe("gazetteer");
      }
    });

    it.each(["3133", "3151", "3125"])("confirms the Victorian postcode %s", (phrase) => {
      const result = resolveLocationPhrase(phrase);
      expect(result.status).toBe("confirmed_vic");
      if (result.status === "confirmed_vic") {
        expect(result.postcode).toBe(phrase);
        expect(result.evidence).toBe("postcode");
      }
    });

    it("is insensitive to case and punctuation", () => {
      for (const phrase of ["BURWOOD EAST", "Burwood East", "burwood east?", " Burwood  East "]) {
        const result = resolveLocationPhrase(phrase);
        expect(result.status, phrase).toBe("confirmed_vic");
        if (result.status === "confirmed_vic") expect(result.locality).toBe("burwood east");
      }
    });
  });

  describe("names shared with another state", () => {
    // The whole point of the strict rule: a name that exists in five states is
    // not evidence of anything, and guessing hands a Sydney user Victorian
    // directory links they cannot use.
    it.each([
      ["burwood", ["NSW", "VIC"]],
      ["richmond", ["NSW", "QLD", "SA", "TAS", "VIC"]],
      ["st kilda", ["QLD", "SA", "VIC"]],
      ["sunshine", ["NSW", "VIC"]],
    ])("refuses to guess %s", (phrase, states) => {
      const result = resolveLocationPhrase(phrase);
      expect(result.status).toBe("ambiguous");
      if (result.status === "ambiguous") {
        expect(result.locality).toBe(phrase);
        expect(result.candidateStates).toEqual(states);
      }
    });

    it("accepts an explicit Victorian state marker", () => {
      for (const phrase of ["burwood vic", "Burwood VIC", "Burwood, Victoria", "richmond vic"]) {
        const result = resolveLocationPhrase(phrase);
        expect(result.status, phrase).toBe("confirmed_vic");
        if (result.status === "confirmed_vic") expect(result.evidence).toBe("explicit_state");
      }
    });

    it("accepts a Victorian postcode alongside the name", () => {
      const result = resolveLocationPhrase("burwood 3125");
      expect(result.status).toBe("confirmed_vic");
      if (result.status === "confirmed_vic") expect(result.evidence).toBe("postcode");
    });

    it("sends the same name in another state out of scope", () => {
      for (const phrase of ["burwood nsw", "Richmond NSW", "st kilda sa"]) {
        const result = resolveLocationPhrase(phrase);
        expect(result.status, phrase).toBe("outside_vic");
      }
    });

    it("takes an explicit state over a conflicting geolocation fix", () => {
      // Someone sitting in Melbourne may be asking on behalf of family in Sydney.
      // What they typed wins over where their browser says they are.
      const result = resolveLocationPhrase("burwood nsw", {
        suburb: "Carlton",
        state: "VIC",
        postcode: "3053",
      });
      expect(result.status).toBe("outside_vic");
    });

    it("lets a Victorian geolocation fix settle an ambiguous name", () => {
      const result = resolveLocationPhrase("burwood", {
        suburb: "Burwood",
        state: "VIC",
        postcode: "3125",
      });
      expect(result.status).toBe("confirmed_vic");
      if (result.status === "confirmed_vic") expect(result.evidence).toBe("geolocation");
    });

    it("does not let a geolocation fix without a state settle anything", () => {
      // A bare city string is exactly the weak signal that caused this bug class.
      const result = resolveLocationPhrase("burwood", { suburb: "Burwood" });
      expect(result.status).toBe("ambiguous");
    });
  });

  describe("places outside Victoria", () => {
    it.each(["sydney", "Sydney", "bondi", "perth", "brisbane", "parramatta", "kangaroo valley"])(
      "puts %s out of scope rather than asking again",
      (phrase) => {
        expect(resolveLocationPhrase(phrase).status).toBe("outside_vic");
      }
    );

    it.each(["2000", "4000", "6000"])("puts the non-Victorian postcode %s out of scope", (p) => {
      expect(resolveLocationPhrase(p).status).toBe("outside_vic");
    });

    it("does not let a compass suffix rescue a non-Victorian base name", () => {
      expect(resolveLocationPhrase("bondi east").status).toBe("outside_vic");
    });
  });

  it("reports an unrecognisable phrase as unknown, not as somewhere outside Victoria", () => {
    // "unknown" asks for a suburb; "outside_vic" explains the scope. Saying the
    // wrong one to a user who typed nonsense is a small harm, but saying
    // "we only cover Victoria" to gibberish is a confusing one.
    expect(resolveLocationPhrase("qwertyuiop").status).toBe("unknown");
  });

  it("reports an empty phrase as missing", () => {
    expect(resolveLocationPhrase("").status).toBe("missing");
    expect(resolveLocationPhrase("   ").status).toBe("missing");
  });

  it.each(["victoria", "vic", "Victoria", "regional victoria"])(
    "treats the statewide phrase %s as confirmed",
    (phrase) => {
      const result = resolveLocationPhrase(phrase);
      expect(result.status).toBe("confirmed_vic");
    }
  );
});

describe("resolveLocation", () => {
  it("extracts a capitalised place after a location preposition", () => {
    const result = resolveLocation({ userMessage: "where can I get screening in Vermont?" });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") expect(result.locality).toBe("vermont");
  });

  it("extracts a place typed in lowercase, the way people actually type", () => {
    // The bug this fixes: requiring a capital letter meant "in burwood east"
    // extracted nothing and the user was asked which suburb they were in — the
    // one they had just named.
    const result = resolveLocation({
      userMessage: "where can i get cervical screening in vermont south?",
    });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") expect(result.locality).toBe("vermont south");
  });

  it("prefers the longest matching locality window", () => {
    const result = resolveLocation({ userMessage: "any clinics in burwood east" });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") expect(result.locality).toBe("burwood east");
  });

  it("keeps a postcode that disambiguates the suburb next to it", () => {
    // "burwood" alone is shared with NSW. Extracting only the name and dropping
    // the postcode the user supplied means asking them which state they meant
    // immediately after they answered that question.
    const result = resolveLocation({ userMessage: "where can i get screening in burwood 3125?" });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") {
      expect(result.postcode).toBe("3125");
      expect(result.evidence).toBe("postcode");
    }
  });

  it("keeps a state that disambiguates the suburb next to it", () => {
    const result = resolveLocation({ userMessage: "where can i get screening in burwood vic?" });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") expect(result.evidence).toBe("explicit_state");
  });

  it("does not read a bare four-digit number as a postcode mid-sentence", () => {
    // The corroboration rule must not turn any number into a location: the
    // words beside it still have to name somewhere.
    expect(resolveLocation({ userMessage: "is the clinic open at 2pm 2026" }).status).toBe(
      "missing"
    );
  });

  describe("phrases that are not places", () => {
    it.each([
      "can I book a test in the morning",
      "what happens in a screening test",
      "are there any events near me",
      "what should I expect at my appointment",
    ])("does not read a location out of %s", (userMessage) => {
      expect(resolveLocation({ userMessage }).status).toBe("missing");
    });

    /**
     * Victoria really does have suburbs called Research, Officer, Sale, Speed
     * and Bass. Lowercased, they are ordinary English words, and the lowercase
     * extractor has no proper-noun signal to lean on — so a corroborating
     * capital, state, or postcode is required before they count as places.
     */
    it.each([
      "what happens in research",
      "can I get this on sale",
      "does it work at speed",
      "should I talk to an officer",
    ])("does not read a location out of %s", (userMessage) => {
      expect(resolveLocation({ userMessage }).status).toBe("missing");
    });

    it("still accepts those suburbs when the user signals a proper noun", () => {
      const capitalised = resolveLocation({ userMessage: "screening in Research" });
      expect(capitalised.status).toBe("confirmed_vic");

      const withState = resolveLocation({ userMessage: "screening in research vic" });
      expect(withState.status).toBe("confirmed_vic");
    });
  });

  it("falls back to the geolocation fix when the message names no place", () => {
    const result = resolveLocation({
      userMessage: "any events coming up?",
      geo: { suburb: "Burwood", state: "VIC", postcode: "3125" },
    });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") {
      expect(result.locality).toBe("burwood");
      expect(result.evidence).toBe("geolocation");
    }
  });

  it("puts a non-Victorian geolocation fix out of scope", () => {
    const result = resolveLocation({
      userMessage: "any events coming up?",
      geo: { suburb: "Bondi", state: "NSW", postcode: "2026" },
    });
    expect(result.status).toBe("outside_vic");
  });

  it("reports missing when there is neither a named place nor a fix", () => {
    expect(resolveLocation({ userMessage: "any events coming up?" }).status).toBe("missing");
    expect(resolveLocation({ userMessage: "any events coming up?", geo: null }).status).toBe(
      "missing"
    );
  });

  it("prefers what the user typed over the geolocation fix", () => {
    const result = resolveLocation({
      userMessage: "what about events in geelong",
      geo: { suburb: "Carlton", state: "VIC", postcode: "3053" },
    });
    expect(result.status).toBe("confirmed_vic");
    if (result.status === "confirmed_vic") expect(result.locality).toBe("geelong");
  });
});
