// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/rag/embed", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/rag/retrieve", () => ({ retrieveChunks: vi.fn() }));
vi.mock("@/lib/mcp/sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp/sources")>()),
  loadApprovedSources: vi.fn(),
}));

import { type TrustedSource, loadApprovedSources } from "@/lib/mcp/sources";
import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import type { RetrievedChunk } from "@/lib/rag/retrieve";
import { searchVictoriaHealthInfo } from "./health-info";

const APPROVED: TrustedSource[] = [
  {
    id: "src-doh",
    organisation: "Department of Health",
    canonicalHost: "health.gov.au",
    sourceClass: "commonwealth_health_authority",
    jurisdiction: "AU",
    permittedContent: ["health_content"],
    reviewedAt: "2026-08-01T00:00:00Z",
    approvedAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "src-ccv",
    organisation: "Cancer Council Victoria",
    canonicalHost: "cancervic.org.au",
    sourceClass: "clinical_nonprofit",
    jurisdiction: "VIC",
    permittedContent: ["health_content"],
    reviewedAt: "2026-08-01T00:00:00Z",
    approvedAt: "2026-07-01T00:00:00Z",
  },
];

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "c1",
    source: "Some Source",
    content: "Cervical screening is recommended every five years.",
    similarityScore: 0.6,
    metadata: { url: "https://www.health.gov.au/page" },
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: the query path is fully mocked
const supabase = {} as any;

describe("searchVictoriaHealthInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2]);
    vi.mocked(loadApprovedSources).mockResolvedValue(APPROVED);
  });

  test("returns approved chunks with full citation metadata", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([chunk()]);

    const result = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "c1",
      sourceName: "Department of Health",
      sourceUrl: "https://www.health.gov.au/page",
      jurisdiction: "AU",
      verification: "official_source",
      reviewedAt: "2026-08-01T00:00:00Z",
    });
    expect(result.noResultReason).toBeUndefined();
    expect(result.sourceIds).toEqual(["src-doh"]);
  });

  test("every returned item carries a source URL, verification, and review date", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "c1", metadata: { url: "https://www.health.gov.au/a" } }),
      chunk({ id: "c2", metadata: { url: "https://www.cancervic.org.au/b" } }),
    ]);

    const { items } = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.sourceUrl).toMatch(/^https:\/\//);
      expect(item.verification).toBeTruthy();
      expect(item.reviewedAt).toBeTruthy();
    }
    expect(items[1].verification).toBe("clinical_nonprofit");
    expect(items[1].jurisdiction).toBe("VIC");
  });

  test("drops chunks whose host is not in the registry", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "who", metadata: { url: "https://www.who.int/fact-sheet" } }),
      chunk({ id: "nhs", metadata: { url: "https://www.nhs.uk/conditions/x" } }),
      chunk({ id: "ok", metadata: { url: "https://www.health.gov.au/page" } }),
    ]);

    const { items } = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(items.map((i) => i.id)).toEqual(["ok"]);
  });

  test("does not match a look-alike host", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ id: "evil", metadata: { url: "https://evilhealth.gov.au/page" } }),
    ]);

    const result = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(result.items).toEqual([]);
    expect(result.noResultReason).toBe("no_approved_match");
  });

  test("drops chunks with no URL in metadata", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([chunk({ metadata: { title: "no url here" } })]);

    const result = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(result.items).toEqual([]);
    expect(result.noResultReason).toBe("no_approved_match");
  });

  test("skips a source with no attestable review date", async () => {
    vi.mocked(loadApprovedSources).mockResolvedValue([
      { ...APPROVED[0], reviewedAt: null, approvedAt: null },
    ]);
    vi.mocked(retrieveChunks).mockResolvedValue([chunk()]);

    const result = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(result.items).toEqual([]);
  });

  test("falls back to approvedAt when reviewedAt is unset", async () => {
    vi.mocked(loadApprovedSources).mockResolvedValue([{ ...APPROVED[0], reviewedAt: null }]);
    vi.mocked(retrieveChunks).mockResolvedValue([chunk()]);

    const { items } = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(items[0].reviewedAt).toBe("2026-07-01T00:00:00Z");
  });

  test("caps results at five and dedupes repeated URLs", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      ...Array.from({ length: 8 }, (_, i) =>
        chunk({ id: `c${i}`, metadata: { url: `https://www.health.gov.au/p${i}` } })
      ),
      chunk({ id: "dupe", metadata: { url: "https://www.health.gov.au/p0" } }),
    ]);

    const { items } = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.sourceUrl)).size).toBe(5);
  });

  test("returns no_approved_match when the registry is empty — without embedding", async () => {
    vi.mocked(loadApprovedSources).mockResolvedValue([]);

    const result = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(result.noResultReason).toBe("no_approved_match");
    expect(embedText).not.toHaveBeenCalled();
  });

  test("a topic biases the embedded query without changing the contract", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([]);

    await searchVictoriaHealthInfo(supabase, { query: "how do I do it", topic: "self_collection" });

    expect(vi.mocked(embedText).mock.calls[0][0]).toContain("how do I do it");
    expect(vi.mocked(embedText).mock.calls[0][0]).toContain("self-collect");
  });

  test("truncates a long excerpt and collapses whitespace", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ content: `${"word ".repeat(200)}\n\n  end` }),
    ]);

    const { items } = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(items[0].excerpt.length).toBeLessThanOrEqual(401);
    expect(items[0].excerpt).toContain("…");
    expect(items[0].excerpt).not.toContain("\n");
  });

  test("passes publishedAt through when the metadata carries one", async () => {
    vi.mocked(retrieveChunks).mockResolvedValue([
      chunk({ metadata: { url: "https://www.health.gov.au/p", published_at: "2026-01-15" } }),
    ]);

    const { items } = await searchVictoriaHealthInfo(supabase, { query: "screening" });

    expect(items[0].publishedAt).toBe("2026-01-15");
  });
});
