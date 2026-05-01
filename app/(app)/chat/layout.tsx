import { ChatSidebar } from "./chat-sidebar-server";
import { SignOutButton } from "./sign-out-button";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-charcoal text-base font-medium">Chat</h1>
        <SignOutButton />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
