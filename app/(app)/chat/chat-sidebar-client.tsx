"use client";

import type { SessionListItem } from "@/lib/chat/sessions";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ChatSidebarClient({ sessions }: { sessions: SessionListItem[] }) {
  const pathname = usePathname();
  // Active id: pathname like "/chat/<id>" → <id>; "/chat" → null
  const match = pathname.match(/^\/chat\/([^/]+)/);
  const activeId = match?.[1] ?? null;

  return (
    <aside className="border-border bg-cream flex w-64 shrink-0 flex-col border-r">
      <div className="border-border border-b p-3">
        <Link
          href="/chat"
          className="border-border text-charcoal hover:bg-white/40 flex items-center gap-2 rounded-lg border bg-white/20 px-3 py-2 text-sm transition-colors"
        >
          <PlusIcon className="size-4" />
          New chat
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="text-muted-gray px-2 py-3 text-xs">No conversations yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              return (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    className={`block truncate rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? "text-charcoal bg-white/60" : "text-charcoal hover:bg-white/30"
                    }`}
                    title={s.displayTitle}
                  >
                    {s.displayTitle}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
