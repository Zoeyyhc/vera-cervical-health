// e2e/helpers/supabase.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(email: string, password: string): Promise<string> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return data.user.id;

  // If the user already exists (e.g. from a previous interrupted run), look them up
  if (error.message.includes("already been registered")) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email === email);
    if (existing) return existing.id;
  }

  throw new Error(`createTestUser failed: ${error.message}`);
}

export async function deleteTestUser(userId: string): Promise<void> {
  if (!userId) return;
  const supabase = getAdminClient();
  // Remove profile first to avoid FK constraint blocking auth user deletion
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);
}
