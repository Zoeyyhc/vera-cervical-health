"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  softDeleteSession,
  starSession,
  undoDeleteSession,
  unstarSession,
} from "@/lib/chat/session-actions";
import type { GroupedSessions, SessionListItem } from "@/lib/chat/sessions";
import { MoreHorizontalIcon, PlusIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  grouped: GroupedSessions;
};

export function ChatSidebarClient({ grouped }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const match = pathname.match(/^\/chat\/([^/]+)/);
  const activeId = match?.[1] ?? null;

  // Local optimistic state — server is source of truth on next router.refresh()
  // (e.g. after Undo or navigation). Star toggles flip starredAt in place; soft
  // delete drops the id into a Set that hides the row.
  const [items, setItems] = useState<SessionListItem[]>(() => [
    ...grouped.starred,
    ...grouped.recent,
  ]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const visible = useMemo(() => items.filter((s) => !hiddenIds.has(s.id)), [items, hiddenIds]);
  const starred = visible.filter((s) => s.starredAt !== null);
  const recent = visible.filter((s) => s.starredAt === null);

  function handleStarToggle(item: SessionListItem) {
    const wasStarred = item.starredAt !== null;
    const optimisticAt = wasStarred ? null : new Date().toISOString();
    setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, starredAt: optimisticAt } : s)));

    const action = wasStarred ? unstarSession : starSession;
    action(item.id).catch(() => {
      setItems((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, starredAt: item.starredAt } : s))
      );
      toast.error("Couldn't update star");
    });
  }

  function handleDelete(item: SessionListItem) {
    setHiddenIds((prev) => new Set(prev).add(item.id));
    if (activeId === item.id) router.push("/chat");

    softDeleteSession(item.id)
      .then(() => {
        toast("Conversation deleted.", {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              undoDeleteSession(item.id)
                .then(() => {
                  setHiddenIds((prev) => {
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                  });
                  router.refresh();
                })
                .catch(() => toast.error("Couldn't restore conversation"));
            },
          },
        });
      })
      .catch(() => {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        toast.error("Couldn't delete conversation");
      });
  }

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
        {visible.length === 0 ? (
          <p className="text-muted-gray px-2 py-3 text-xs">No conversations yet.</p>
        ) : (
          <>
            {starred.length > 0 && (
              <SessionSection
                heading="STARRED"
                items={starred}
                activeId={activeId}
                onStarToggle={handleStarToggle}
                onDelete={handleDelete}
              />
            )}
            <SessionSection
              heading="RECENT"
              items={recent}
              activeId={activeId}
              onStarToggle={handleStarToggle}
              onDelete={handleDelete}
            />
          </>
        )}
      </nav>
    </aside>
  );
}

function SessionSection({
  heading,
  items,
  activeId,
  onStarToggle,
  onDelete,
}: {
  heading: string;
  items: SessionListItem[];
  activeId: string | null;
  onStarToggle: (item: SessionListItem) => void;
  onDelete: (item: SessionListItem) => void;
}) {
  return (
    <div className="mb-2">
      <p className="text-muted-gray px-2 py-1 text-xs uppercase tracking-wider">{heading}</p>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <SessionRow
            key={s.id}
            item={s}
            isActive={s.id === activeId}
            onStarToggle={onStarToggle}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function SessionRow({
  item,
  isActive,
  onStarToggle,
  onDelete,
}: {
  item: SessionListItem;
  isActive: boolean;
  onStarToggle: (item: SessionListItem) => void;
  onDelete: (item: SessionListItem) => void;
}) {
  const [isPendingStar, startStarTransition] = useTransition();
  const isStarred = item.starredAt !== null;

  return (
    <li
      className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
        isActive ? "bg-white/60" : "hover:bg-white/30"
      }`}
    >
      <button
        type="button"
        disabled={isPendingStar}
        aria-label={`${isStarred ? "Unstar" : "Star"} ${item.displayTitle}`}
        onClick={() => startStarTransition(() => onStarToggle(item))}
        className="text-muted-gray hover:text-charcoal flex size-7 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
      >
        <StarIcon className={`size-3.5 ${isStarred ? "fill-charcoal text-charcoal" : ""}`} />
      </button>
      <Link
        href={`/chat/${item.id}`}
        className="text-charcoal flex-1 truncate py-2 text-sm"
        title={item.displayTitle}
      >
        {item.displayTitle}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`More actions for ${item.displayTitle}`}
              className="text-muted-gray hover:text-charcoal flex size-7 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <MoreHorizontalIcon className="size-4" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={() => onDelete(item)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
