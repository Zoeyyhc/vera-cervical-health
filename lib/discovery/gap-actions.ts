"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Length cap matches QUESTION_MAX in lib/ai/rag-gap.ts so manual and
// real gaps store comparable question text.
const questionSchema = z.string().trim().min(1).max(200);

/**
 * Add a knowledge gap by hand. Stored as a `rag_gap` analytics event so it
 * flows through the existing mineGaps pipeline unchanged; `source: "manual"`
 * is display-only. Inserted via the admin's RLS-bound client (the
 * "users can insert own" policy allows auth.uid() = user_id). Admin-only.
 */
export async function addManualGap(question: string): Promise<void> {
  const validQuestion = questionSchema.parse(question);
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase.from("analytics_events").insert({
    user_id: user.id,
    event_type: "rag_gap",
    payload: { question: validQuestion, top_score: 0, source: "manual" },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/knowledge/gaps");
}
