"use client";

import { Button } from "@/components/ui/button";
import { deleteDocument } from "@/lib/rag/document-actions";
import type { KnowledgeDocument } from "@/lib/rag/documents";
import { useState } from "react";
import { toast } from "sonner";

/** One row in the document list, with a confirm-gated delete. */
export function DocumentRow({ doc }: { doc: KnowledgeDocument }) {
  const [pending, setPending] = useState(false);
  const label = doc.title ?? doc.source ?? "(no source)";

  async function onDelete() {
    const ok = window.confirm(
      `Delete “${label}” and all ${doc.chunkCount} of its chunks? This cannot be undone.`
    );
    if (!ok) return;
    setPending(true);
    try {
      await deleteDocument(doc.source);
      toast.success(`Deleted “${label}”.`);
    } catch {
      toast.error("Could not delete the document. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-charcoal">{label}</p>
        <p className="truncate text-xs text-muted-gray">
          {doc.source ?? "(no source)"} · {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"} ·{" "}
          {doc.createdAt.slice(0, 10)}
        </p>
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={onDelete}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </li>
  );
}
