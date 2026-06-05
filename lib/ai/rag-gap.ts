import { auditContext } from "@/lib/ai/audit-context";

const QUESTION_MAX = 200;

/**
 * Top-similarity below this counts as a knowledge-coverage gap worth recording.
 * Deliberately stricter than the 0.45 retrieval floor in lib/rag/retrieve.ts
 * (see the design doc): catches weak-coverage answers, not just zero-result
 * ones. The discovery pipeline (Plan 2) mines these events.
 */
export const GAP_THRESHOLD = 0.52;

export type RecordRagGapArgs = {
  question: string;
  topScore: number;
};

/**
 * Record one RAG coverage gap as a `rag_gap` analytics event, using the
 * audit-scoped service-role client (mirrors `recordAbuseEvent`). No-op outside
 * an `auditContext.run(...)` scope. Never throws — a failed gap log must not
 * break chat.
 */
export async function recordRagGap(args: RecordRagGapArgs): Promise<void> {
  const ctx = auditContext.get();
  if (!ctx) return;

  const { error } = await ctx.supabaseAdmin.from("analytics_events").insert({
    user_id: ctx.userId,
    event_type: "rag_gap",
    payload: {
      question: args.question.slice(0, QUESTION_MAX),
      top_score: args.topScore,
    },
  });
  if (error) console.error("[rag-gap] insert failed:", error.message);
}
