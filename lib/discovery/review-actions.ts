"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { ingestDocument } from "@/lib/rag/store";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const candidateIdSchema = z.string().uuid();

/**
 * Approve a pending candidate: ingest its content into knowledge_chunks (via
 * the existing pipeline) and mark it approved. Idempotent — a no-op if the
 * candidate is no longer pending. Admin-only.
 */
export async function approveCandidate(id: string): Promise<void> {
  const validId = candidateIdSchema.parse(id);
  const { supabase, user } = await requireAdmin();

  const { data: cand, error } = await supabase
    .from("knowledge_candidates")
    .select(
      "source_url, title, raw_content, authority_score, domain_tags, gap_refs, created_at, status"
    )
    .eq("id", validId)
    .single();
  if (error || !cand) throw new Error(error?.message ?? "candidate not found");
  if (cand.status !== "pending") return;

  await ingestDocument(supabase, {
    content: cand.raw_content,
    source: cand.source_url,
    metadata: {
      url: cand.source_url,
      title: cand.title,
      authorityScore: cand.authority_score,
      discoveredAt: cand.created_at,
      gapRefs: cand.gap_refs,
      domainTags: cand.domain_tags,
    },
  });

  const { error: updErr } = await supabase
    .from("knowledge_candidates")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", validId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/admin/knowledge");
}

/** Reject a candidate (kept for audit). Admin-only. */
export async function rejectCandidate(id: string): Promise<void> {
  const validId = candidateIdSchema.parse(id);
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("knowledge_candidates")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("id", validId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/knowledge");
}
