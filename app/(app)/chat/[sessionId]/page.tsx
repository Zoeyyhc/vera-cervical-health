import { loadSessionWithMessages } from "@/lib/chat/sessions";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ChatClient } from "../chat-client";

type Props = { params: { sessionId: string } };

export default async function ChatSessionPage({ params }: Props) {
  const { sessionId } = params;
  const supabase = createClient();

  // Validate the session (exists, not soft-deleted, owned by the caller via
  // RLS) and load its messages in parallel — the two queries have no data
  // dependency, so this is one network round-trip instead of two serial ones.
  // A soft-deleted or non-owned session yields null → notFound(); the row is
  // preserved in the DB so a future restore path can revive it.
  const initialMessages = await loadSessionWithMessages(supabase, sessionId);
  if (initialMessages === null) notFound();

  return <ChatClient initialSessionId={sessionId} initialMessages={initialMessages} />;
}
