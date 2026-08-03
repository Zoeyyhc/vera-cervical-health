// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/mcp/client", () => ({
  searchVictoriaHealthInfoViaMcp: vi.fn(),
  findVictoriaScreeningServicesViaMcp: vi.fn(),
  listVictoriaVerifiedEventsViaMcp: vi.fn(),
}));

import {
  findVictoriaScreeningServicesViaMcp,
  listVictoriaVerifiedEventsViaMcp,
  searchVictoriaHealthInfoViaMcp,
} from "@/lib/mcp/client";
import {
  isVictorianTurn,
  resolveTurnLocation,
  runVictoriaEventsAgent,
  runVictoriaHealthAgent,
  runVictoriaServicesAgent,
} from "./victoria-agent";

const HEALTH_ITEM = {
  id: "c1",
  title: "Cervical screening",
  excerpt: "Screening is recommended every five years.",
  sourceName: "Department of Health",
  sourceUrl: "https://www.health.gov.au/page",
  jurisdiction: "AU" as const,
  verification: "official_source" as const,
  reviewedAt: "2026-08-01T00:00:00Z",
};

const DIRECTORY_LINK = {
  directoryName: "healthdirect Service Finder",
  searchUrl: "https://www.healthdirect.gov.au/australian-health-services",
  coverage: "VIC" as const,
  supports: [],
  verification: "directory_listing" as const,
  reviewedAt: "2026-08-01T00:00:00Z",
  confirmationNotice: "Please confirm with the provider before attending.",
};

const EVENT = {
  id: "e1",
  name: "Screening information session",
  startsAt: "2026-09-01T10:00:00+10:00",
  endsAt: "2026-09-01T12:00:00+10:00",
  locationLabel: "Carlton 3053",
  format: "in_person" as const,
  organiser: "Cancer Council Victoria",
  registrationUrl: "https://www.cancervic.org.au/register",
  sourceUrl: "https://www.cancervic.org.au/event",
  verification: "manually_curated" as const,
  reviewedAt: "2026-08-01T00:00:00Z",
  expiresAt: "2026-09-01T12:00:00+10:00",
};

describe("resolveTurnLocation", () => {
  test("prefers the geolocated city over the message", () => {
    expect(resolveTurnLocation({ userMessage: "clinics in Sydney", city: "Melbourne" })).toBe(
      "Melbourne"
    );
  });

  test("falls back to a place mentioned in the message", () => {
    expect(resolveTurnLocation({ userMessage: "where can I get screened in Geelong" })).toBe(
      "Geelong"
    );
  });

  test("picks up a bare postcode in the message", () => {
    expect(resolveTurnLocation({ userMessage: "any clinics near 3053" })).toBe("3053");
  });

  test("returns null when there is no location at all", () => {
    expect(resolveTurnLocation({ userMessage: "where can I get screened" })).toBeNull();
  });
});

describe("isVictorianTurn", () => {
  test("is true for a Victorian city and false elsewhere", () => {
    expect(isVictorianTurn({ userMessage: "what is HPV", city: "Melbourne" })).toBe(true);
    expect(isVictorianTurn({ userMessage: "what is HPV", city: "Sydney" })).toBe(false);
  });

  test("is false when no location is known — the MCP is not consulted", () => {
    expect(isVictorianTurn({ userMessage: "what is HPV" })).toBe(false);
  });
});

describe("runVictoriaHealthAgent", () => {
  beforeEach(() => vi.clearAllMocks());

  test("shapes items into numbered context with matching sources", async () => {
    vi.mocked(searchVictoriaHealthInfoViaMcp).mockResolvedValue({ items: [HEALTH_ITEM] });

    const result = await runVictoriaHealthAgent({ userMessage: "screening", city: "Melbourne" });

    expect(result.sources).toEqual([
      {
        id: "1",
        title: "Department of Health",
        url: "https://www.health.gov.au/page",
        chunkId: "c1",
      },
    ]);
    expect(result.context).toContain("[1]");
    expect(result.context).toContain("official health authority");
    expect(result.context).toContain("reviewed 2026-08-01");
  });

  test("degrades to an empty result when the MCP is unavailable", async () => {
    vi.mocked(searchVictoriaHealthInfoViaMcp).mockResolvedValue(null);

    const result = await runVictoriaHealthAgent({ userMessage: "screening", city: "Melbourne" });

    expect(result).toEqual({ context: "", sources: [] });
  });

  test("degrades when there is no approved match", async () => {
    vi.mocked(searchVictoriaHealthInfoViaMcp).mockResolvedValue({
      items: [],
      noResultReason: "no_approved_match",
    });

    expect(await runVictoriaHealthAgent({ userMessage: "x" })).toEqual({
      context: "",
      sources: [],
    });
  });
});

describe("runVictoriaServicesAgent", () => {
  beforeEach(() => vi.clearAllMocks());

  test("carries the confirmation notice into the grounding context", async () => {
    vi.mocked(findVictoriaScreeningServicesViaMcp).mockResolvedValue({
      directoryLinks: [DIRECTORY_LINK],
    });

    const result = await runVictoriaServicesAgent({
      userMessage: "where can I get screened",
      city: "Carlton",
    });

    expect(result.context).toContain("DIRECTORY LISTING");
    expect(result.context).toContain(DIRECTORY_LINK.confirmationNotice);
    expect(result.sources[0].chunkId).toBe(`vic-directory:${DIRECTORY_LINK.searchUrl}`);
  });

  test("asks for a location when none can be resolved, without calling the MCP", async () => {
    const result = await runVictoriaServicesAgent({ userMessage: "where can I get screened" });

    expect(result.needsLocation).toBe(true);
    expect(findVictoriaScreeningServicesViaMcp).not.toHaveBeenCalled();
  });

  test("flags an out-of-Victoria location without calling the MCP", async () => {
    const result = await runVictoriaServicesAgent({
      userMessage: "clinics near me",
      city: "Sydney",
    });

    expect(result.outsideVictoria).toBe(true);
    expect(findVictoriaScreeningServicesViaMcp).not.toHaveBeenCalled();
  });

  test("degrades when the MCP is unavailable", async () => {
    vi.mocked(findVictoriaScreeningServicesViaMcp).mockResolvedValue(null);

    const result = await runVictoriaServicesAgent({ userMessage: "clinics", city: "Carlton" });

    expect(result).toEqual({ context: "", sources: [] });
  });
});

describe("runVictoriaEventsAgent", () => {
  beforeEach(() => vi.clearAllMocks());

  test("shapes events with organiser, dates, and registration link", async () => {
    vi.mocked(listVictoriaVerifiedEventsViaMcp).mockResolvedValue({ events: [EVENT] });

    const result = await runVictoriaEventsAgent({ userMessage: "events", city: "Carlton" });

    expect(result.context).toContain("Screening information session");
    expect(result.context).toContain("Cancer Council Victoria");
    expect(result.context).toContain(EVENT.registrationUrl);
    expect(result.sources[0].chunkId).toBe("vic-events:e1");
  });

  test("queries without a location when none is known — statewide events still count", async () => {
    vi.mocked(listVictoriaVerifiedEventsViaMcp).mockResolvedValue({ events: [EVENT] });

    await runVictoriaEventsAgent({ userMessage: "any events coming up" });

    expect(listVictoriaVerifiedEventsViaMcp).toHaveBeenCalledWith({});
  });

  test("skips the MCP for a non-Victorian location", async () => {
    const result = await runVictoriaEventsAgent({ userMessage: "events", city: "Brisbane" });

    expect(result.outsideVictoria).toBe(true);
    expect(listVictoriaVerifiedEventsViaMcp).not.toHaveBeenCalled();
  });

  test("degrades when the MCP is unavailable", async () => {
    vi.mocked(listVictoriaVerifiedEventsViaMcp).mockResolvedValue(null);

    expect(await runVictoriaEventsAgent({ userMessage: "events", city: "Carlton" })).toEqual({
      context: "",
      sources: [],
    });
  });
});
