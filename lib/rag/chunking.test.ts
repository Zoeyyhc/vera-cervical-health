import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText", () => {
  describe("trivial cases", () => {
    it("returns an empty array for empty input", () => {
      expect(chunkText("")).toEqual([]);
    });

    it("returns a single-element array when input fits in one chunk", () => {
      const text = "hello world";
      expect(chunkText(text)).toEqual([text]);
    });

    it("returns a single chunk at exactly the chunk-size boundary", () => {
      // Default chunkSize: 512 tokens × 4 chars = 2048 chars
      const text = "a".repeat(2048);
      expect(chunkText(text)).toEqual([text]);
    });
  });

  describe("multi-chunk cases", () => {
    it("splits over-budget input into multiple chunks", () => {
      // 5000 chars > 2048-char chunk → multiple chunks
      const text = "a".repeat(5000);
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      // Concatenating overlapping chunks reconstructs more than the original
      // (because of overlap); but every char of the original IS in some chunk.
      const reconstructed = chunks.join("");
      expect(reconstructed.length).toBeGreaterThanOrEqual(text.length);
    });

    it("each chunk's last `overlap` chars equal the next chunk's first `overlap` chars (hard-cut path)", () => {
      // 5000 'a's with no break points → algorithm hard-cuts at chunk-size
      // boundaries with strict overlap.
      const text = "a".repeat(5000);
      const chunks = chunkText(text);
      // Default overlap: 64 tokens × 4 chars = 256 chars
      const overlapChars = 256;
      for (let i = 0; i < chunks.length - 1; i++) {
        const tail = chunks[i].slice(-overlapChars);
        const head = chunks[i + 1].slice(0, overlapChars);
        expect(head).toBe(tail);
      }
    });

    it("is deterministic — same input → same output across runs", () => {
      const text = "a".repeat(5000);
      const a = chunkText(text);
      const b = chunkText(text);
      expect(a).toEqual(b);
    });
  });

  describe("break-point preference", () => {
    // Use small custom opts so test inputs are tractable.

    it("breaks at a paragraph boundary when one is in the search window", () => {
      // chunkSize 10 tokens = 40 chars. We craft text where a "\n\n" sits
      // just inside the last 25% of the first chunk's char window (so >= 30).
      const text =
        "abcdefghijklmnopqrstuvwxyz12345\n\nbody two body two body two body two body two";
      // First chunk's idealEnd is min(0+40, text.length) = 40. The "\n\n" is
      // at position 31-32 (0-indexed). minBreak = 0 + floor(40 * 0.75) = 30.
      // 31 >= 30, so paragraph wins; chunk ends at 33 (after the "\n\n").
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      expect(chunks[0]).toBe("abcdefghijklmnopqrstuvwxyz12345\n\n");
    });

    it("breaks at a sentence boundary when no paragraph break is in window", () => {
      // chunkSize 10 = 40 chars. Period+space at pos 31-32.
      const text = "abcdefghijklmnopqrstuvwxyz12345. body two body two body two body two body two";
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      // idealEnd 40, sentence ". " at 31-32, minBreak 30. Sentence wins.
      // End = 31 + 2 = 33. chunks[0] = text.slice(0, 33).
      expect(chunks[0]).toBe("abcdefghijklmnopqrstuvwxyz12345. ");
    });

    it("breaks at a word boundary when no paragraph or sentence in window", () => {
      // No "\n\n" or ". ". One space at position 31; everything after is
      // contiguous so no other space is in the search window.
      const text = `abcdefghijklmnopqrstuvwxyz12345 ${"w".repeat(60)}`;
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      // idealEnd 40. lastIndexOf(" ", 40) = 31. word break wins (31 >= minBreak 30).
      // End = 31 + 1 = 32. chunks[0] = text.slice(0, 32).
      expect(chunks[0]).toBe("abcdefghijklmnopqrstuvwxyz12345 ");
    });

    it("hard-cuts when no break point falls in the search window", () => {
      // chunkSize 10 = 40 chars. No spaces or punctuation anywhere → hard cut.
      const text = "a".repeat(80);
      const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
      // idealEnd = 40. lastIndexOf(" ", 40) = -1. Hard cut at 40.
      expect(chunks[0]).toBe("a".repeat(40));
    });
  });

  describe("opts", () => {
    it("respects custom chunkSize and overlap", () => {
      const text = "a".repeat(2000);
      // chunkSize 50 tokens = 200 chars; overlap 10 tokens = 40 chars.
      const chunks = chunkText(text, { chunkSize: 50, overlap: 10 });
      expect(chunks[0]).toHaveLength(200);
      // Strict overlap on hard-cut path
      expect(chunks[1].slice(0, 40)).toBe(chunks[0].slice(-40));
    });
  });
});
