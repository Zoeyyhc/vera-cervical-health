import { createClient } from "@/lib/supabase/server";
import type { Source } from "@/types/agents";
import { notFound } from "next/navigation";
import { ChatClient } from "../chat-client";

type Props = { params: { sessionId: string } };

export default async function ChatSessionPage({ params }: Props) {
  const { sessionId } = params;
  const supabase = createClient();

  // Validate the session exists, is not soft-deleted, and belongs to the
  // caller (RLS scopes the query to the current user). A soft-deleted session
  // 404s even for its owner — the row is preserved in the DB so a future
  // restore path can revive it, but the URL is intentionally dead.
  const { data: session, error: sessionErr } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (sessionErr || !session) notFound();

  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select("id, role, content, sources")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (msgErr) throw new Error(msgErr.message);

  const initialMessages =
    messages?.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      status: "complete" as const,
      sources: (m.sources as Source[] | null) ?? undefined,
    })) ?? [];

  return <ChatClient initialSessionId={sessionId} initialMessages={initialMessages} />;
}
