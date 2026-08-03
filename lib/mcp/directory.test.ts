// @vitest-environment node

import { describe, expect, test, vi } from "vitest";
import { buildSearchUrl, findVictoriaScreeningServices } from "./directory";

/**
 * Spec §5.2 and acceptance criterion 2: a Victorian request returns approved
 * directory links, labelled as directory information, with a confirmation
 * notice — and nothing that looks like a provider record.
 */

type Row = {
  id: string;
  directory_name: string;
  search_url_template: string;
  supports: string[];
  confirmation_notice: string;
  reviewed_at: string | null;
  sort_order: number;
  source_id: string;
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "d1",
    directory_name: "healthdirect Service Finder",
    search_url_template: "https://www.healthdirect.gov.au/australian-health-services",
    supports: ["accessibility"],
    confirmation_notice: "Confirm with the provider before attending.",
    reviewed_at: "2026-08-01T00:00:00Z",
    sort_order: 10,
    source_id: "src-hd",
    ...overrides,
  };
}

/** Chainable stub over the PostgREST builder; resolves with `rows` at the end. */
function mockSupabase(rows: Row[], error: { message: string } | null = null) {
  const calls: Array<[string, unknown, unknown]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "contains"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, args[0], args[1]]);
      return builder;
    });
  }
  builder.order = vi.fn(() => Promise.resolve({ data: rows, error }));
  return { supabase: { from: vi.fn(() => builder) }, calls, builder };
}

describe("findVictoriaScreeningServices", () => {
  test("returns approved links for a Victorian location", async () => {
    const { supabase } = mockSupabase([row()]);

    const result = await findVictoriaScreeningServices(
      // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
      supabase as any,
      { location: "Carlton" }
    );

    expect(result.directoryLinks).toHaveLength(1);
    expect(result.directoryLinks[0]).toMatchObject({
      directoryName: "healthdirect Service Finder",
      coverage: "VIC",
      verification: "directory_listing",
      confirmationNotice: "Confirm with the provider before attending.",
      reviewedAt: "2026-08-01T00:00:00Z",
    });
    expect(result.sourceIds).toEqual(["src-hd"]);
  });

  test("every link is labelled directory_listing and carries a confirmation notice", async () => {
    const { supabase } = mockSupabase([row({ id: "a" }), row({ id: "b", source_id: "src-ccv" })]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const { directoryLinks } = await findVictoriaScreeningServices(supabase as any, {
      location: "3053",
    });

    for (const link of directoryLinks) {
      expect(link.verification).toBe("directory_listing");
      expect(link.confirmationNotice.length).toBeGreaterThan(0);
      expect(link.reviewedAt).toBeTruthy();
    }
  });

  test("returns outside_victoria without querying at all", async () => {
    const { supabase } = mockSupabase([row()]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await findVictoriaScreeningServices(supabase as any, { location: "Sydney" });

    expect(result.directoryLinks).toEqual([]);
    expect(result.noResultReason).toBe("outside_victoria");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("requires the link AND its source to be approved", async () => {
    const { supabase, calls } = mockSupabase([row()]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    await findVictoriaScreeningServices(supabase as any, { location: "Carlton" });

    expect(calls).toContainEqual(["eq", "status", "approved"]);
    expect(calls).toContainEqual(["eq", "trusted_sources.status", "approved"]);
    expect(calls).toContainEqual(["contains", "trusted_sources.permitted_content", ["directory"]]);
  });

  test("skips a link with no review date", async () => {
    const { supabase } = mockSupabase([row({ reviewed_at: null })]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const result = await findVictoriaScreeningServices(supabase as any, { location: "Carlton" });

    expect(result.directoryLinks).toEqual([]);
    expect(result.noResultReason).toBe("no_approved_directory");
  });

  test("ranks a preference-matching directory first without dropping the others", async () => {
    const { supabase } = mockSupabase([
      row({ id: "generic", supports: [], sort_order: 10, directory_name: "Generic" }),
      row({
        id: "self",
        supports: ["self_collection"],
        sort_order: 20,
        directory_name: "Self-collection",
      }),
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const { directoryLinks } = await findVictoriaScreeningServices(supabase as any, {
      location: "Carlton",
      preferences: { selfCollection: true },
    });

    expect(directoryLinks.map((l) => l.directoryName)).toEqual(["Self-collection", "Generic"]);
  });

  test("caps at five links", async () => {
    const { supabase } = mockSupabase(
      Array.from({ length: 9 }, (_, i) => row({ id: `d${i}`, source_id: `src-${i}` }))
    );

    // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
    const { directoryLinks } = await findVictoriaScreeningServices(supabase as any, {
      location: "Carlton",
    });

    expect(directoryLinks).toHaveLength(5);
  });

  test("propagates a query error", async () => {
    const { supabase } = mockSupabase([], { message: "db down" });

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: query-builder stub
      findVictoriaScreeningServices(supabase as any, { location: "Carlton" })
    ).rejects.toThrow("db down");
  });
});

describe("buildSearchUrl", () => {
  test("returns a template without the token verbatim", () => {
    const template = "https://www.healthdirect.gov.au/australian-health-services";
    expect(buildSearchUrl(template, "Carlton")).toBe(template);
  });

  test("substitutes and URL-encodes the location", () => {
    expect(buildSearchUrl("https://example.gov.au/find?q={location}", "St Kilda")).toBe(
      "https://example.gov.au/find?q=St%20Kilda"
    );
  });

  test("encoding prevents a location from escaping its parameter", () => {
    const url = buildSearchUrl("https://example.gov.au/find?q={location}&safe=1", "a&evil=1");
    expect(url).toBe("https://example.gov.au/find?q=a%26evil%3D1&safe=1");
    expect(new URL(url).searchParams.get("evil")).toBeNull();
  });

  test("the host always comes from the approved template, never the input", () => {
    // Even if a location somehow slipped past the schema, it lands in the query
    // string of the approved host — it cannot redirect the URL elsewhere.
    const url = buildSearchUrl("https://example.gov.au/find?q={location}", "//attacker.test");
    expect(new URL(url).hostname).toBe("example.gov.au");
  });
});
