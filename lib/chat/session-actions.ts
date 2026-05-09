"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const sessionIdSchema = z.string().uuid();

type SessionPatch = { starred_at?: string | null; deleted_at?: string | null };

async function updateSession(id: string, patch: SessionPatch): Promise<void> {
  const validId = sessionIdSchema.parse(id);
  const supabase = createClient();
  const { error } = await supabase.from("chat_sessions").update(patch).eq("id", validId);
  if (error) throw new Error(error.message);
}

export async function starSession(id: string): Promise<void> {
  await updateSession(id, { starred_at: new Date().toISOString() });
}

export async function unstarSession(id: string): Promise<void> {
  await updateSession(id, { starred_at: null });
}

export async function softDeleteSession(id: string): Promise<void> {
  await updateSession(id, { deleted_at: new Date().toISOString() });
}

export async function undoDeleteSession(id: string): Promise<void> {
  await updateSession(id, { deleted_at: null });
}
