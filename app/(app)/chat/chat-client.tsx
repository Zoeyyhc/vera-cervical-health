"use client";

import { Button } from "@/components/ui/button";
import { parseChatStream } from "@/lib/ai/streaming";
import { type GeoFix, useGeoFix } from "@/lib/hooks/use-geo-fix";
import type { Source } from "@/types/agents";
import { Loader2Icon, SendIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CitationChips, remapCitations } from "./citation-chips";
import { EmptyState } from "./empty-state";

// react-markdown + remark-gfm + rehype-sanitize is sizeable and isn't needed
// until the first assistant message renders, so keep it out of the initial
// chat bundle. ssr:false is safe — assistant content is client-rendered anyway.
const MarkdownMessage = dynamic(
  () => import("@/components/markdown-message").then((m) => m.MarkdownMessage),
  { ssr: false }
);

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
  const geoFix = useGeoFix();

  // Auto-scroll to bottom on every messages change (covers both the optimistic
  // append and every per-token append during streaming). The body only reads
  // the ref; `messages` is the trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is the trigger, not a body dep
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Pure submit pipeline — takes the message text directly so the input
  // field and the EmptyState's prompt buttons can both drive it without a
  // state round-trip.
  async function submit(text: string) {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setIsStreaming(true);

    // Capture before any state mutation: a "new" send is one where no session
    // existed yet. Only this case needs router.refresh() at done — the sidebar
    // has to learn about the freshly created row.
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
      await streamTurn(trimmed, assistantId, wasNewSession, {});
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

  type TurnOptions = {
    geo?: GeoFix;
    geolocationAttempted?: boolean;
    continuation?: boolean;
  };

  /**
   * One request/response round for a turn.
   *
   * Runs at most twice. The server answers `location_request` when the turn
   * needs to know where the user is — at which point the browser prompt goes up,
   * tied to the question the user just asked — and the same turn is resent as a
   * continuation carrying whatever came back. A refusal or a timeout is resent
   * too, flagged as attempted, so the server asks the user to type a suburb
   * instead of asking the browser again.
   */
  async function streamTurn(
    text: string,
    assistantId: string,
    wasNewSession: boolean,
    options: TurnOptions
  ): Promise<void> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId ?? undefined,
        ...options,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    let needsLocation = false;

    for await (const event of parseChatStream(response.body)) {
      if (event.type === "start") {
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
      } else if (event.type === "location_request") {
        needsLocation = true;
      } else if (event.type === "done") {
        if (needsLocation) break;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: "complete" } : m))
        );
        if (wasNewSession) router.refresh();
      } else {
        toast.error(event.message || "Something went wrong");
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m))
        );
      }
    }

    if (!needsLocation) return;

    // Guard against a server that keeps asking: `continuation` is only ever set
    // here, so a second location_request cannot start a third round.
    if (options.continuation) return;

    const fix = await geoFix.request();
    await streamTurn(text, assistantId, wasNewSession, {
      ...(fix ? { geo: fix } : {}),
      geolocationAttempted: true,
      continuation: true,
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    void submit(trimmed);
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
            <EmptyState onPrompt={submit} disabled={isStreaming} />
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";

  const bubbleClass = isUser
    ? "text-charcoal border-border border bg-white/40"
    : isError
      ? "text-muted-gray border-border border bg-white/20"
      : "text-charcoal border-border border bg-white/60";

  // Renumber the model's retrieval-rank markers ([1][2][5]) to a contiguous
  // 1..N once, then feed the same remapped content/sources to both the inline
  // renderer and the footer chips so their numbering stays aligned.
  const { content, sources } = useMemo(
    () => remapCitations(message.content, message.sources),
    [message.content, message.sources]
  );

  const renderBody = () => {
    if (!message.content) {
      return isStreaming ? <TypingDots /> : null;
    }
    if (isUser) {
      return message.content;
    }
    return <MarkdownMessage content={content} sources={sources} messageId={message.id} />;
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={`${isUser ? "whitespace-pre-wrap" : ""} rounded-lg px-4 py-2.5 text-sm leading-relaxed ${bubbleClass}`}
        >
          {renderBody()}
        </div>
        {message.role === "assistant" && (
          <CitationChips sources={sources} messageId={message.id} content={content} />
        )}
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
