"use client";

import { Button } from "@/components/ui/button";
import { addDocument } from "@/lib/rag/document-actions";
import { useState } from "react";
import { toast } from "sonner";

/** Admin-only form to paste a document into the knowledge base. */
export function AddDocumentForm() {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const { chunksCreated } = await addDocument({ name, content });
      toast.success(`Added “${name}” — ${chunksCreated} chunk${chunksCreated === 1 ? "" : "s"}.`);
      setName("");
      setContent("");
    } catch {
      toast.error("Could not add the document. Check the inputs and try again.");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full rounded border border-[#eceae4] bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-muted-gray";

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-5">
      <h2 className="text-lg font-medium text-charcoal">Add a document</h2>
      <input
        aria-label="Document name"
        placeholder="Document name (source)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <textarea
        aria-label="Document content"
        placeholder="Paste the document text…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        className={inputClass}
      />
      <Button type="submit" disabled={pending || !name.trim() || !content.trim()}>
        {pending ? "Adding…" : "Add to knowledge base"}
      </Button>
    </form>
  );
}
