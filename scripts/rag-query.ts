/**
 * Inspect RAG retrieval for a query — embeds the query, runs the cosine-
 * similarity RPC, and prints ranked chunks with similarity scores. Bypasses
 * `runRagAgent`'s threshold filter so you can see the actual distribution
 * (run with --threshold to filter, --count to change top-k).
 *
 * Run:
 *   pnpm rag:query "what is hpv?"
 *   pnpm rag:query "cervical screening age" --threshold 0.5
 *   pnpm rag:query "vaccine side effects" --count 10
 *
 * Requirements:
 *   - Local Supabase running, env loaded via Node's --env-file flag
 */

import { embedText } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import type { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  const positional: string[] = [];
  let threshold = 0; // default: no filter, see everything
  let count = 10;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--threshold") threshold = Number(args[++i]);
    else if (args[i] === "--count") count = Number(args[++i]);
    else positional.push(args[i]);
  }

  const query = positional.join(" ").trim();
  if (!query) {
    console.error('Usage: pnpm rag:query "<query>" [--threshold 0.5] [--count 10]');
    process.exit(1);
  }
  return { query, threshold, count };
}

async function main() {
  const { query, threshold, count } = parseArgs();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run: eval "$(supabase status -o env)")'
    );
  }

  const supabase = createClient<Database>(url, key);

  console.log(`🔍 Query: "${query}"`);
  console.log(`   threshold=${threshold}  count=${count}\n`);

  const embedding = await embedText(query);
  const chunks = await retrieveChunks(supabase, embedding, { threshold, count });

  if (chunks.length === 0) {
    console.log("(no chunks retrieved)");
    return;
  }

  chunks.forEach((c, i) => {
    const sim = c.similarityScore.toFixed(3);
    const preview = c.content.replace(/\s+/g, " ").slice(0, 140);
    console.log(`#${i + 1}  similarity=${sim}  source=${c.source ?? "(none)"}`);
    console.log(`    ${preview}…\n`);
  });

  const min = Math.min(...chunks.map((c) => c.similarityScore));
  const max = Math.max(...chunks.map((c) => c.similarityScore));
  const avg = chunks.reduce((s, c) => s + c.similarityScore, 0) / chunks.length;
  console.log(
    `Stats: min=${min.toFixed(3)}  max=${max.toFixed(3)}  avg=${avg.toFixed(3)}  count=${chunks.length}`
  );
}

main().catch((err) => {
  console.error("rag-query failed:", err);
  process.exit(1);
});
