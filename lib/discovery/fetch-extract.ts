import * as cheerio from "cheerio";
import { MAX_CONTENT_BYTES } from "./constants";
import type { ExtractedPage } from "./types";

/** Collapse runs of whitespace/newlines into single spaces and trim. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Fetch a URL and extract its main article text with cheerio. Strips
 * non-content elements, then prefers <article>, then <main>, then <body>.
 * Returns null on any fetch failure, non-2xx, or empty extraction. Content is
 * truncated to MAX_CONTENT_BYTES.
 */
export async function fetchAndExtract(url: string): Promise<ExtractedPage | null> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "text/html" } });
  } catch (err) {
    console.error("[discovery] fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
  if (!res.ok) return null;

  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, noscript, form").remove();

  const title = normalize($("title").first().text()) || normalize($("h1").first().text());

  const root =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("body");

  let content = normalize(root.text());
  if (content.length === 0) return null;

  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    content = content.slice(0, MAX_CONTENT_BYTES);
  }
  return { title, content };
}
