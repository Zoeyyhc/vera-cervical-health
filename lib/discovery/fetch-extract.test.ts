// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fetchAndExtract } from "./fetch-extract";

const html = (body: string, title = "Doc Title") =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`;

describe("fetchAndExtract", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  test("extracts <article> text and the title, stripping scripts/nav", async () => {
    const body = `
      <nav>menu links</nav>
      <script>console.log('x')</script>
      <article><h1>HPV</h1><p>HPV is common.</p><p>Get screened.</p></article>
      <footer>copyright</footer>`;
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(html(body), { status: 200 }));

    const page = await fetchAndExtract("https://who.int/hpv");

    expect(page?.title).toBe("Doc Title");
    expect(page?.content).toContain("HPV is common.");
    expect(page?.content).toContain("Get screened.");
    expect(page?.content).not.toContain("menu links");
    expect(page?.content).not.toContain("copyright");
  });

  test("falls back to <main>, then <body>, when no <article>", async () => {
    const body = `<main><p>Main content here.</p></main>`;
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(html(body), { status: 200 }));
    const page = await fetchAndExtract("https://cdc.gov/x");
    expect(page?.content).toContain("Main content here.");
  });

  test("returns null on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    expect(await fetchAndExtract("https://x.example")).toBeNull();
  });

  test("returns null when fetch throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("net"));
    expect(await fetchAndExtract("https://x.example")).toBeNull();
  });

  test("returns null when extracted content is empty", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(html("<article>   </article>"), { status: 200 })
    );
    expect(await fetchAndExtract("https://x.example")).toBeNull();
  });
});
