import { loadSessionsForUser } from "@/lib/chat/sessions";
import { createClient } from "@/lib/supabase/server";
import { ChatSidebarClient } from "./chat-sidebar-client";

export async function ChatSidebar() {
  const supabase = createClient();
  const sessions = await loadSessionsForUser(supabase);
  return <ChatSidebarClient sessions={sessions} />;
}
