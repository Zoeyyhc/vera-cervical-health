import { auditContext } from "@/lib/ai/audit-context";
import { runDiscovery } from "@/lib/discovery/run";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Knowledge-discovery trigger. Authenticates EITHER:
 *  - a Vercel Cron request (Authorization: Bearer ${CRON_SECRET}) → trigger 'cron'
 *  - an admin session → trigger 'manual'
 *
 * GET because Vercel Cron only issues GET requests. Runs inside auditContext so
 * the pipeline's LLM calls are audited and its inserts use the service-role
 * client (bypassing RLS on the admin-only staging tables).
 */
export async function GET(request: Request): Promise<Response> {
  let trigger: "cron" | "manual";

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${env.cronSecret}`) {
    trigger = "cron";
  } else {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });

    trigger = "manual";
  }

  const supabaseAdmin = createServiceRoleClient();
  try {
    const result = await auditContext.run({ supabaseAdmin, userId: null, sessionId: null }, () =>
      runDiscovery(supabaseAdmin, { trigger })
    );
    return Response.json({
      gapsProcessed: result.gapsProcessed,
      candidatesStaged: result.candidatesStaged,
    });
  } catch (err) {
    console.error(
      "[/api/embeddings/discover] run failed:",
      err instanceof Error ? err.message : err
    );
    return Response.json({ error: "discovery_failed" }, { status: 500 });
  }
}
