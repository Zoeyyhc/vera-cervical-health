/**
 * Create (or promote) a test admin account.
 *
 * Uses the service-role Admin API to create a pre-confirmed auth user, then
 * flips its `profiles.role` to 'admin' (the on_auth_user_created trigger
 * inserts the profile with the default 'user' role first). Idempotent: if the
 * email already exists, it skips creation and just promotes to admin.
 *
 * Run (local Supabase must be running — `supabase start`):
 *   pnpm admin:create
 *   pnpm admin:create admin@vera.test "my-password"
 *
 * Defaults (test only — do NOT use against prod):
 *   email    admin@vera.test
 *   password admin12345
 *
 * Requirements:
 *   - Local Supabase running, env loaded via Node's --env-file flag
 *   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import type { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_EMAIL = "admin@vera.test";
const DEFAULT_PASSWORD = "admin12345";

async function main() {
  const email = process.argv[2] ?? DEFAULT_EMAIL;
  const password = process.argv[3] ?? DEFAULT_PASSWORD;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — load .env.local."
    );
    process.exit(1);
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create a pre-confirmed user. If it already exists, fall back to lookup.
  let userId: string | undefined;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
    console.info(`Created auth user ${email} (${userId}).`);
  } else {
    // Already registered (or another error) — try to find the existing user.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) {
      console.error("Create failed and could not list users:", createErr?.message, listErr.message);
      process.exit(1);
    }
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) {
      console.error("Create failed:", createErr?.message ?? "unknown error");
      process.exit(1);
    }
    userId = existing.id;
    console.info(`User ${email} already exists (${userId}) — promoting to admin.`);
  }

  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId);
  if (roleErr) {
    console.error("Failed to set role=admin:", roleErr.message);
    process.exit(1);
  }

  console.info(`✅ Admin ready — email: ${email}  password: ${password}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
