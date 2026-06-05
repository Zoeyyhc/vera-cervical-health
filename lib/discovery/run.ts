import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTHORITY_MIN,
  MAX_CANDIDATES_PER_RUN,
  MAX_RESULTS_PER_QUERY,
  RELEVANCE_MIN,
  RUN_BUDGET_MS,
} from "./constants";
import { checkDuplicate } from "./dedup";
import { fetchAndExtract } from "./fetch-extract";
import { mineGaps } from "./mine-gaps";
import { scoreAuthority } from "./score-authority";
import { searchWeb } from "./search";
import { stageCandidate } from "./stage-candidate";
import { synthesizeQueries } from "./synthesize-queries";
import type { DiscoveryRunResult } from "./types";

export type RunDiscoveryOptions = {
  trigger: "cron" | "manual";
  /** Override the wall-clock budget (ms). Defaults to RUN_BUDGET_MS. */
  budgetMs?: number;
};

/**
 * Coordinator. Opens a discovery_runs row, mines gap clusters, and for each
 * cluster searches → scores → fetches → dedups → stages, under a per-run
 * candidate cap. Closes the run row (completed/failed). Per-candidate failures
 * are swallowed so one bad URL never aborts the batch; a thrown stage (e.g.
 * mineGaps) fails the whole run.
 */
export async function runDiscovery(
  supabaseAdmin: SupabaseClient<Database>,
  opts: RunDiscoveryOptions
): Promise<DiscoveryRunResult> {
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from("discovery_runs")
    .insert({ trigger: opts.trigger, status: "running" })
    .select("id")
    .single();
  if (runErr || !runRow) throw new Error(runErr?.message ?? "discovery_run insert failed");
  const runId = (runRow as { id: string }).id;
  const deadline = Date.now() + (opts.budgetMs ?? RUN_BUDGET_MS);

  let gapsProcessed = 0;
  let candidatesStaged = 0;

  try {
    const clusters = await mineGaps(supabaseAdmin);

    outer: for (const cluster of clusters) {
      gapsProcessed += 1;
      const queries = await synthesizeQueries(cluster);

      for (const query of queries) {
        const results = await searchWeb(query, MAX_RESULTS_PER_QUERY);

        for (const result of results) {
          if (candidatesStaged >= MAX_CANDIDATES_PER_RUN || Date.now() >= deadline) break outer;

          try {
            const scores = await scoreAuthority(result);
            if (scores.authorityScore < AUTHORITY_MIN || scores.relevanceScore < RELEVANCE_MIN) {
              continue;
            }
            const page = await fetchAndExtract(result.url);
            if (!page) continue;

            const { duplicate, contentHash } = await checkDuplicate(supabaseAdmin, page.content);
            if (duplicate) continue;

            const id = await stageCandidate(supabaseAdmin, {
              sourceUrl: result.url,
              page,
              scores,
              gapEventIds: cluster.gapEventIds,
              contentHash,
            });
            if (id) candidatesStaged += 1;
          } catch (err) {
            console.error(
              "[discovery] candidate failed:",
              result.url,
              err instanceof Error ? err.message : err
            );
          }
        }
      }
    }

    await supabaseAdmin
      .from("discovery_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        gaps_processed: gapsProcessed,
        candidates_staged: candidatesStaged,
      })
      .eq("id", runId);

    return { runId, gapsProcessed, candidatesStaged };
  } catch (err) {
    await supabaseAdmin
      .from("discovery_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        gaps_processed: gapsProcessed,
        candidates_staged: candidatesStaged,
      })
      .eq("id", runId);
    throw err;
  }
}
