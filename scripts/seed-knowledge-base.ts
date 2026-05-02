/**
 * Seed the knowledge_chunks table from `supabase/seeds/knowledge/`.
 *
 * Run with: `pnpm seed:kb`
 *
 * Requirements:
 *   - Local Supabase running (`supabase start`)
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *     (run `eval "$(supabase status -o env)"` first)
 *   - OPENAI_API_KEY in `.env.local` (loaded explicitly via dotenv —
 *     tsx doesn't auto-load `.env.local` the way Next.js does)
 *
 * Safe to re-run — clears prior chunks per source before re-ingesting.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ingestDocument } from "@/lib/rag/store";
import { SEED_DOCUMENTS, type SeedDocument } from "@/supabase/seeds/knowledge/manifest";
import type { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv() {
  if (!SUPABASE_URL) {
    throw new Error('missing SUPABASE_URL (run: eval "$(supabase status -o env)")');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("missing OPENAI_API_KEY (set in .env.local)");
  }
}

type SeedResult = {
  source: string;
  chunks: number;
  ok: boolean;
  error?: string;
};

async function seedOne(
  supabase: ReturnType<typeof createClient<Database>>,
  doc: SeedDocument
): Promise<SeedResult> {
  const filepath = path.join("supabase/seeds/knowledge", doc.file);

  let content: string;
  try {
    content = await readFile(filepath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: doc.source, chunks: 0, ok: false, error: `read failed: ${msg}` };
  }

  // Per-source idempotency: clear prior chunks for this source before re-ingesting.
  const { error: delErr } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("source", doc.source);
  if (delErr) {
    return {
      source: doc.source,
      chunks: 0,
      ok: false,
      error: `delete failed: ${delErr.message}`,
    };
  }

  try {
    const { chunkIds } = await ingestDocument(supabase, {
      source: doc.source,
      content,
      metadata: {
        url: doc.url,
        license: doc.license,
        retrieved_on: doc.retrievedOn,
        seed: true,
      },
    });
    return { source: doc.source, chunks: chunkIds.length, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: doc.source, chunks: 0, ok: false, error: `ingest failed: ${msg}` };
  }
}

async function main() {
  assertEnv();

  const supabase = createClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string
  );

  console.log(`📚 Seeding ${SEED_DOCUMENTS.length} documents…\n`);

  const results: SeedResult[] = [];
  for (const doc of SEED_DOCUMENTS) {
    process.stdout.write(`  • ${doc.source}…  `);
    const r = await seedOne(supabase, doc);
    results.push(r);
    if (r.ok) {
      console.log(`✅ ${r.chunks} chunks`);
    } else {
      console.log(`❌ ${r.error}`);
    }
  }

  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
  const okCount = results.filter((r) => r.ok).length;
  const allOk = okCount === SEED_DOCUMENTS.length;
  console.log(
    `\n${allOk ? "✅" : "⚠️"}  Seeded ${okCount}/${SEED_DOCUMENTS.length} documents → ${totalChunks} chunks total`
  );

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
