"use client";

import { MarkdownMessage } from "@/components/markdown-message";
import { Button } from "@/components/ui/button";
import { parseChatStream } from "@/lib/ai/streaming";
import type { Source } from "@/types/agents";
import { Loader2Icon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CitationChips } from "./citation-chips";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "error";
  sources?: Source[];
};

type Props = {
  initialSessionId: string | null;
  initialMessages: ChatMessage[];
};

export function ChatClient({ initialSessionId, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on every messages change (covers both the optimistic
  // append and every per-token append during streaming). The body only reads
  // the ref; `messages` is the trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the trigger, not a body dep
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isStreaming) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    setInput("");
    setIsStreaming(true);

    // Capture before any state mutation: a "new" send is one where no session
    // existed yet. Only this case needs router.refresh() at done — the sidebar
    // has to learn about the freshly created row. Follow-up messages on an
    // existing session bump updated_at on the server, but we accept a slightly
    // stale sidebar order until the next full nav rather than re-running the
    // sessions query (which previously fired on every single message).
    const wasNewSession = sessionId === null;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      status: "complete",
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: sessionId ?? undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      for await (const event of parseChatStream(response.body)) {
        if (event.type === "start") {
          // First send when no session existed — swap the URL to /chat/<id>
          // without unmounting the chat-client (router.replace would cross a
          // route boundary and lose the in-flight stream).
          if (sessionId === null) {
            window.history.replaceState({}, "", `/chat/${event.sessionId}`);
          }
          setSessionId(event.sessionId);
        } else if (event.type === "text") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.text } : m))
          );
        } else if (event.type === "sources") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, sources: event.sources } : m))
          );
        } else if (event.type === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "complete" } : m))
          );
          // Only refresh on the first turn of a brand-new session so the
          // sidebar picks up the new row. For follow-up turns the sidebar
          // entry already exists; skipping the refresh avoids re-running the
          // sessions query (and re-rendering the layout) on every message.
          if (wasNewSession) router.refresh();
        } else {
          // event.type === "error" — server-side stream error. The route
          // already persisted the partial with a marker; just notify the user.
          toast.error(event.message || "Something went wrong");
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m))
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't reach the chat service";
      toast.error(message);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m))
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Submit through the form so handleSubmit's gating runs.
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-border bg-cream border-t px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask about cervical health…"
            rows={1}
            className="border-border placeholder:text-muted-gray text-charcoal min-h-[44px] flex-1 resize-none rounded-lg border bg-white/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-charcoal/10 disabled:opacity-60"
          />
          <Button type="submit" disabled={isStreaming || !input.trim()} aria-label="Send">
            {isStreaming ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-gray pt-12 text-center text-sm">
      Ask a cervical-health question to get started. Replies are not a substitute for a clinician's
      advice — see a doctor for symptoms or specific situations.
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";

  const bubbleClass = isUser
    ? "text-charcoal border-border border bg-white/40"
    : isError
      ? "text-muted-gray border-border border bg-white/20"
      : "text-charcoal border-border border bg-white/60";

  const renderBody = () => {
    if (!message.content) {
      return isStreaming ? <TypingDots /> : null;
    }
    if (isUser) {
      return message.content;
    }
    return <MarkdownMessage content={message.content} />;
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={`${isUser ? "whitespace-pre-wrap" : ""} rounded-lg px-4 py-2.5 text-sm leading-relaxed ${bubbleClass}`}
        >
          {renderBody()}
        </div>
        {message.role === "assistant" && <CitationChips sources={message.sources} />}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Assistant is typing">
      <span className="bg-muted-gray inline-block size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
      <span className="bg-muted-gray inline-block size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
      <span className="bg-muted-gray inline-block size-1.5 animate-bounce rounded-full" />
    </span>
  );
}
