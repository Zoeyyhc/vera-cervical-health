import { env } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES RLS — server-only.
 *
 * Never import from a client component, never return the instance to the
 * browser, never use it on routes that handle untrusted user data without
 * an explicit authz check first. Today: only the LLM-audit wrapper uses it,
 * and only to insert into `llm_calls`.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL — required for the service-role client.");
  }
  return createSupabaseClient<Database>(url, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
