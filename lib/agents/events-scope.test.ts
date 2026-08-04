import { describe, expect, it } from "vitest";
import { detectEventsScope } from "./events-scope";
import { resolveLocation } from "./location";

/**
 * "What's on in Victoria?" is a statewide question and may be answered without
 * knowing where the user is. "What's on near me?" and "What's on in Burwood?"
 * are not — answering either without a confirmed location means either guessing
 * or reporting an empty search that never ran.
 */

function scopeOf(userMessage: string) {
  return detectEventsScope(userMessage, resolveLocation({ userMessage }));
}

describe("detectEventsScope", () => {
  it.each([
    "what health events are on in victoria?",
    "any cervical screening events in Victoria",
    "are there statewide events coming up",
  ])("treats %s as statewide", (message) => {
    expect(scopeOf(message)).toBe("statewide");
  });

  it.each([
    "any events near me?",
    "what's happening nearby",
    "are there any health events around me",
    "any screening events in my area",
  ])("treats %s as nearby", (message) => {
    expect(scopeOf(message)).toBe("nearby");
  });

  it.each([
    "any events in burwood east",
    "what's on in Geelong",
    "health events in bondi",
    "events in burwood",
  ])("treats %s as tied to a named place", (message) => {
    expect(scopeOf(message)).toBe("specified_location");
  });

  it("does not read a bare question as statewide", () => {
    // The old path called the MCP with no location here, which is the statewide
    // query — so an empty result read as "nothing near you" when it meant
    // "nothing in the state". Ask instead.
    expect(scopeOf("are there any events coming up?")).toBe("nearby");
  });

  it("prefers the named suburb when the state is named alongside it", () => {
    expect(scopeOf("any events in burwood victoria")).toBe("specified_location");
    expect(scopeOf("events in Geelong, VIC")).toBe("specified_location");
  });

  it("treats an explicit nearby phrasing as nearby even with a state named", () => {
    expect(scopeOf("any events near me in victoria")).toBe("nearby");
  });
});
