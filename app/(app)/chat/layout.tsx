import { ChatSidebar } from "./chat-sidebar-server";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden">
      <ChatSidebar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
