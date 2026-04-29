import { SignOutButton } from "./sign-out-button";

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-cream p-8">
      <h1 className="text-2xl font-semibold text-charcoal">Chat</h1>
      <p className="mt-2 text-muted-gray">Coming soon.</p>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
