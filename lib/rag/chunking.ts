const CHARS_PER_TOKEN = 4;
const DEFAULT_CHUNK_SIZE_TOKENS = 512;
const DEFAULT_OVERLAP_TOKENS = 64;

export type ChunkOptions = {
  /** Target chunk size in tokens. Default 512. */
  chunkSize?: number;
  /** Overlap in tokens between consecutive chunks. Default 64. */
  overlap?: number;
};

/**
 * Split a long text into chunks of approximately `chunkSize` tokens with
 * `overlap` tokens of shared context between consecutive chunks.
 *
 * Token approximation: 1 token ≈ 4 chars. Avoids a tokenizer dependency for
 * v1 — swap to `tiktoken` later if RAG quality drops.
 *
 * Break-point preference (searched backward from the ideal cut, within the
 * last 25% of the chunk): paragraph (`\n\n`), sentence (`. `), word (` `).
 * If none is found in window, hard-cut at the ideal end.
 *
 * Pure function — no I/O, deterministic.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSizeChars = (opts.chunkSize ?? DEFAULT_CHUNK_SIZE_TOKENS) * CHARS_PER_TOKEN;
  const overlapChars = (opts.overlap ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN;

  if (text.length === 0) return [];
  if (text.length <= chunkSizeChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const idealEnd = Math.min(start + chunkSizeChars, text.length);
    const end = idealEnd === text.length ? idealEnd : findBreakPoint(text, start, idealEnd);

    chunks.push(text.slice(start, end));

    if (end >= text.length) break;

    // Advance with overlap. Force forward progress if overlap would stall.
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

function findBreakPoint(text: string, start: number, target: number): number {
  // Search backward from `target` for a natural break, but only accept one
  // within the last 25% of the chunk window. Prevents trivial breaks (e.g.,
  // a single space near `start`) from producing tiny chunks.
  const minBreak = start + Math.floor((target - start) * 0.75);

  // Paragraph
  const paragraph = text.lastIndexOf("\n\n", target);
  if (paragraph >= minBreak) return paragraph + 2;

  // Sentence
  const sentence = text.lastIndexOf(". ", target);
  if (sentence >= minBreak) return sentence + 2;

  // Word
  const word = text.lastIndexOf(" ", target);
  if (word >= minBreak) return word + 1;

  // Hard cut
  return target;
}
