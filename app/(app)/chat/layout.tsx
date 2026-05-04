import { ChatSidebar } from "./chat-sidebar-server";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatSidebar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
