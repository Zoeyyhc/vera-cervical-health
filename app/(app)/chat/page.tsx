import { ChatClient } from "./chat-client";
import { SignOutButton } from "./sign-out-button";

export default function ChatPage() {
  return (
    <main className="bg-cream flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-charcoal text-base font-medium">Chat</h1>
        <SignOutButton />
      </header>
      <ChatClient />
    </main>
  );
}
