import { auditContext } from "@/lib/ai/audit-context";

const EXCERPT_MAX = 200;

export type AbuseEventType = "injection_attempt";

export type RecordAbuseEventArgs = {
  type: AbuseEventType;
  messageExcerpt: string;
};

/**
 * Insert one abuse event using the audit-scoped service-role client.
 * No-op when called outside an `auditContext.run(...)` scope (mirrors
 * `writeAuditRow`). Never throws — a failed abuse log must not break chat.
 */
export async function recordAbuseEvent(args: RecordAbuseEventArgs): Promise<void> {
  const ctx = auditContext.get();
  if (!ctx) return;

  const { error } = await ctx.supabaseAdmin.from("abuse_events").insert({
    user_id: ctx.userId,
    session_id: ctx.sessionId,
    type: args.type,
    message_excerpt: args.messageExcerpt.slice(0, EXCERPT_MAX),
  });
  if (error) console.error("[abuse] insert failed:", error.message);
}
