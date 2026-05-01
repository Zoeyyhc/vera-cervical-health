import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ChatClient } from "../chat-client";

type Props = { params: { sessionId: string } };

export default async function ChatSessionPage({ params }: Props) {
  const { sessionId } = params;
  const supabase = createClient();

  // Validate the session exists and belongs to the caller (RLS scopes this).
  const { data: session, error: sessionErr } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !session) notFound();

  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (msgErr) throw new Error(msgErr.message);

  const initialMessages =
    messages?.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      status: "complete" as const,
    })) ?? [];

  return <ChatClient initialSessionId={sessionId} initialMessages={initialMessages} />;
}
