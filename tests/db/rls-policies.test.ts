// tests/db/rls-policies.test.ts
// @vitest-environment node

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

// The suite only runs when the local Supabase instance is up and both keys
// are exported. This matches the pattern in tests/db/profiles.test.ts so the
// default `pnpm test` run doesn't break on machines that aren't set up.
const canRun = Boolean(SERVICE_ROLE) && Boolean(ANON_KEY);

describe.runIf(canRun)("RLS policies (#12)", () => {
  let admin: SupabaseClient; // service-role client (bypasses RLS)
  let userAClient: SupabaseClient; // anon-key client signed in as userA
  let userBClient: SupabaseClient; // anon-key client signed in as userB
  let adminUserClient: SupabaseClient; // anon-key client signed in as adminUser
  let anonClient: SupabaseClient; // anon-key client with no session

  let userAId = "";
  let userBId = "";
  let adminUserId = "";

  const createdUserIds: string[] = [];
  const createdChunkIds: string[] = [];

  const password = "password1234";
  const suffix = Date.now();
  const userAEmail = `rls-user-a-${suffix}@example.com`;
  const userBEmail = `rls-user-b-${suffix}@example.com`;
  const adminEmail = `rls-admin-${suffix}@example.com`;

  /**
   * Create a fresh anon-key client and sign it in with the given credentials.
   * The returned client talks to PostgREST with the user's JWT, so RLS is
   * evaluated against that user — which is exactly what we want to test.
   */
  async function signedInClient(email: string): Promise<SupabaseClient> {
    const client = createClient(SUPABASE_URL, ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    anonClient = createClient(SUPABASE_URL, ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create three auth users via the admin API. email_confirm:true skips the
    // confirmation step so signInWithPassword works immediately.
    for (const email of [userAEmail, userBEmail, adminEmail]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      const id = data.user?.id as string;
      createdUserIds.push(id);
      if (email === userAEmail) userAId = id;
      if (email === userBEmail) userBId = id;
      if (email === adminEmail) adminUserId = id;
    }

    // Promote adminUser to role='admin' via service role (bypasses RLS).
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", adminUserId);
    if (roleErr) throw roleErr;

    userAClient = await signedInClient(userAEmail);
    userBClient = await signedInClient(userBEmail);
    adminUserClient = await signedInClient(adminEmail);
  });

  afterAll(async () => {
    // Best-effort teardown. Chunks first (no FK to users), then auth users
    // (cascade deletes profiles + chat_sessions + chat_messages).
    if (createdChunkIds.length > 0) {
      await admin.from("knowledge_chunks").delete().in("id", createdChunkIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  // ───── profiles ────────────────────────────────────────────────────────
  describe("profiles", () => {
    it("user can read their own profile", async () => {
      const { data, error } = await userAClient
        .from("profiles")
        .select("id, email, role")
        .eq("id", userAId)
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBe(userAId);
    });

    it("user cannot read another user's profile", async () => {
      const { data, error } = await userAClient
        .from("profiles")
        .select("id")
        .eq("id", userBId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("user can update their own profile", async () => {
      const { error } = await userAClient
        .from("profiles")
        .update({ locale: "zh" })
        .eq("id", userAId);
      expect(error).toBeNull();

      const { data } = await admin
        .from("profiles")
        .select("locale")
        .eq("id", userAId)
        .single();
      expect(data?.locale).toBe("zh");
    });

    it("user cannot update another user's profile", async () => {
      const { error } = await userAClient
        .from("profiles")
        .update({ locale: "fr" })
        .eq("id", userBId);
      // RLS update-mismatch surfaces as either an error or a 0-row update.
      // Either way the row must be unchanged.
      const { data } = await admin
        .from("profiles")
        .select("locale")
        .eq("id", userBId)
        .single();
      expect(data?.locale).not.toBe("fr");
      // Explicit: the error path is acceptable; the silent 0-row path is too.
      expect(error === null || typeof error === "object").toBe(true);
    });

    it("admin can read every profile", async () => {
      const { data, error } = await adminUserClient
        .from("profiles")
        .select("id")
        .in("id", [userAId, userBId, adminUserId]);
      expect(error).toBeNull();
      expect(data?.length).toBe(3);
    });
  });

  // ───── chat_sessions & chat_messages ──────────────────────────────────
  describe("chat_sessions & chat_messages", () => {
    let userASession = "";
    let userBSession = "";

    it("user A can create a chat session for themselves", async () => {
      const { data, error } = await userAClient
        .from("chat_sessions")
        .insert({ user_id: userAId, title: "A's session" })
        .select("id")
        .single();
      expect(error).toBeNull();
      userASession = data?.id as string;
      expect(userASession).toBeTruthy();
    });

    it("user B can create a chat session for themselves", async () => {
      const { data, error } = await userBClient
        .from("chat_sessions")
        .insert({ user_id: userBId, title: "B's session" })
        .select("id")
        .single();
      expect(error).toBeNull();
      userBSession = data?.id as string;
    });

    it("user A cannot create a chat session owned by user B", async () => {
      const { data, error } = await userAClient
        .from("chat_sessions")
        .insert({ user_id: userBId, title: "hijack" })
        .select("id")
        .maybeSingle();
      // WITH CHECK violation — error non-null, data null.
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it("user A can read only their own chat sessions", async () => {
      const { data, error } = await userAClient
        .from("chat_sessions")
        .select("id, user_id");
      expect(error).toBeNull();
      expect(data?.every((row) => row.user_id === userAId)).toBe(true);
      expect(data?.some((row) => row.id === userASession)).toBe(true);
    });

    it("user A can insert a message into their own session", async () => {
      const { error } = await userAClient
        .from("chat_messages")
        .insert({ session_id: userASession, role: "user", content: "hello" });
      expect(error).toBeNull();
    });

    it("user A cannot insert a message into user B's session", async () => {
      const { error } = await userAClient
        .from("chat_messages")
        .insert({ session_id: userBSession, role: "user", content: "hijack" });
      expect(error).not.toBeNull();
    });

    it("user A cannot read messages from user B's session", async () => {
      // First, give B a message via admin (bypass RLS).
      await admin
        .from("chat_messages")
        .insert({ session_id: userBSession, role: "user", content: "B only" });
      const { data, error } = await userAClient
        .from("chat_messages")
        .select("id, session_id")
        .eq("session_id", userBSession);
      expect(error).toBeNull();
      expect(data?.length).toBe(0);
    });

    it("user A can delete their own session (and cascade its messages)", async () => {
      const { error } = await userAClient
        .from("chat_sessions")
        .delete()
        .eq("id", userASession);
      expect(error).toBeNull();
      const { data } = await admin
        .from("chat_sessions")
        .select("id")
        .eq("id", userASession)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("admin can read every chat session", async () => {
      const { data, error } = await adminUserClient
        .from("chat_sessions")
        .select("id, user_id")
        .in("user_id", [userAId, userBId]);
      expect(error).toBeNull();
      // At least B's session still exists.
      expect(data?.some((row) => row.user_id === userBId)).toBe(true);
    });

    it("admin can read every chat message", async () => {
      const { data, error } = await adminUserClient
        .from("chat_messages")
        .select("id, session_id")
        .eq("session_id", userBSession);
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThan(0);
    });
  });

  // ───── knowledge_chunks ───────────────────────────────────────────────
  describe("knowledge_chunks", () => {
    beforeAll(async () => {
      // Seed one chunk via service role so there's something to select against.
      const embedding = Array.from({ length: 1536 }, () => 0);
      const { data, error } = await admin
        .from("knowledge_chunks")
        .insert({
          source: "rls-test",
          content: "rls fixture content",
          embedding,
        })
        .select("id")
        .single();
      if (error) throw error;
      createdChunkIds.push(data?.id as string);
    });

    it("anonymous client cannot SELECT knowledge_chunks", async () => {
      const { data, error } = await anonClient
        .from("knowledge_chunks")
        .select("id")
        .in("id", createdChunkIds);
      // Either an explicit error or empty array — both prove denial.
      expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
    });

    it("authenticated user can SELECT knowledge_chunks", async () => {
      const { data, error } = await userAClient
        .from("knowledge_chunks")
        .select("id")
        .in("id", createdChunkIds);
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    });

    it("non-admin user cannot INSERT a knowledge_chunk", async () => {
      const embedding = Array.from({ length: 1536 }, () => 0);
      const { error } = await userAClient.from("knowledge_chunks").insert({
        source: "rls-test",
        content: "should fail",
        embedding,
      });
      expect(error).not.toBeNull();
    });

    it("non-admin user cannot UPDATE a knowledge_chunk", async () => {
      const { error } = await userAClient
        .from("knowledge_chunks")
        .update({ source: "tampered" })
        .in("id", createdChunkIds);
      const { data } = await admin
        .from("knowledge_chunks")
        .select("source")
        .in("id", createdChunkIds);
      expect(data?.every((r) => r.source !== "tampered")).toBe(true);
      expect(error === null || typeof error === "object").toBe(true);
    });

    it("non-admin user cannot DELETE a knowledge_chunk", async () => {
      const { error } = await userAClient
        .from("knowledge_chunks")
        .delete()
        .in("id", createdChunkIds);
      const { data } = await admin
        .from("knowledge_chunks")
        .select("id")
        .in("id", createdChunkIds);
      expect(data?.length).toBe(1);
      expect(error === null || typeof error === "object").toBe(true);
    });

    it("admin user can INSERT a knowledge_chunk", async () => {
      const embedding = Array.from({ length: 1536 }, () => 0);
      const { data, error } = await adminUserClient
        .from("knowledge_chunks")
        .insert({
          source: "rls-test-admin",
          content: "admin-inserted",
          embedding,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (data?.id) createdChunkIds.push(data.id);
    });
  });

  // ───── analytics_events ──────────────────────────────────────────────
  describe("analytics_events", () => {
    it("user can insert an event for themselves", async () => {
      const { error } = await userAClient
        .from("analytics_events")
        .insert({ user_id: userAId, event_type: "page_view", payload: {} });
      expect(error).toBeNull();
    });

    it("user cannot insert an event with someone else's user_id", async () => {
      const { error } = await userAClient
        .from("analytics_events")
        .insert({ user_id: userBId, event_type: "page_view", payload: {} });
      expect(error).not.toBeNull();
    });

    it("non-admin user cannot SELECT analytics events", async () => {
      const { data, error } = await userAClient
        .from("analytics_events")
        .select("id");
      // Either an error or an empty result — both acceptable, both mean denied.
      expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
    });

    it("admin user can SELECT analytics events", async () => {
      const { data, error } = await adminUserClient
        .from("analytics_events")
        .select("id, user_id, event_type");
      expect(error).toBeNull();
      expect((data?.length ?? 0)).toBeGreaterThan(0);
      expect(data?.some((row) => row.user_id === userAId)).toBe(true);
    });
  });
});
