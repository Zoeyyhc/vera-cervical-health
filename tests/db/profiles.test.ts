// tests/db/profiles.test.ts
// @vitest-environment node

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Skip the entire suite unless BOTH the service-role and anon keys are present
// — matches `tests/db/rls-policies.test.ts`. Gating on service role alone is
// unsafe because vitest.setup.ts stubs that var so `@/lib/env` can load in
// tests; the anon key is the genuine signal that a local Supabase is up.
describe.runIf(Boolean(SERVICE_ROLE) && Boolean(ANON_KEY))("profiles migration (#11)", () => {
  let supabase: SupabaseClient;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
  });

  it("has display_name and updated_at columns on public.profiles", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, role, locale, created_at, updated_at")
      .limit(0);
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it("auto-creates a profile row on signup with null display_name when no metadata is sent", async () => {
    const email = `epic2-no-meta-${Date.now()}@example.com`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "password1234",
      email_confirm: true,
    });
    expect(error).toBeNull();
    const userId = data.user?.id as string;
    createdUserIds.push(userId);

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, display_name, created_at, updated_at")
      .eq("id", userId)
      .single();
    expect(pErr).toBeNull();
    expect(profile?.id).toBe(userId);
    expect(profile?.email).toBe(email);
    expect(profile?.display_name).toBeNull();
    expect(profile?.created_at).toBeTruthy();
    expect(profile?.updated_at).toBeTruthy();
  });

  it("populates display_name from raw_user_meta_data on signup", async () => {
    const email = `epic2-with-meta-${Date.now()}@example.com`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "password1234",
      email_confirm: true,
      user_metadata: { display_name: "Ada Lovelace" },
    });
    expect(error).toBeNull();
    const userId = data.user?.id as string;
    createdUserIds.push(userId);

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    expect(pErr).toBeNull();
    expect(profile?.display_name).toBe("Ada Lovelace");
  });

  it("coerces an empty-string display_name in metadata to null", async () => {
    const email = `epic2-empty-meta-${Date.now()}@example.com`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "password1234",
      email_confirm: true,
      user_metadata: { display_name: "" },
    });
    expect(error).toBeNull();
    const userId = data.user?.id as string;
    createdUserIds.push(userId);

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();
    expect(pErr).toBeNull();
    expect(profile?.display_name).toBeNull();
  });

  it("advances updated_at when a profile row is updated", async () => {
    const email = `epic2-updated-at-${Date.now()}@example.com`;
    const { data } = await supabase.auth.admin.createUser({
      email,
      password: "password1234",
      email_confirm: true,
    });
    const userId = data.user?.id as string;
    createdUserIds.push(userId);

    const { data: before } = await supabase
      .from("profiles")
      .select("updated_at")
      .eq("id", userId)
      .single();

    // Wait a few ms so the new timestamp is measurably later.
    await new Promise((r) => setTimeout(r, 20));

    const { error: uErr } = await supabase
      .from("profiles")
      .update({ locale: "zh" })
      .eq("id", userId);
    expect(uErr).toBeNull();

    const { data: after } = await supabase
      .from("profiles")
      .select("updated_at")
      .eq("id", userId)
      .single();

    const beforeMs = new Date(before?.updated_at as string).getTime();
    const afterMs = new Date(after?.updated_at as string).getTime();
    expect(afterMs).toBeGreaterThan(beforeMs);
  });
});
