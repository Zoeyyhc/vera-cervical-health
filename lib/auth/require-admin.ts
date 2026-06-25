import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export type AdminContext = {
  supabase: SupabaseClient<Database>;
  user: User;
};

/**
 * Server-side admin gate for admin routes/actions. Redirects unauthenticated
 * users to /login and non-admins to /. On success returns the RLS-bound client
 * and the user. Per CLAUDE.md, admin access is re-checked on every request.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  return { supabase, user };
}

/**
 * Non-redirecting admin check for shared surfaces (e.g. the (app) layout/nav).
 * Returns false for guests and non-admins instead of redirecting, so it is safe
 * to call on routes that all authenticated users can see.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin";
}
