"use client";

import { Button } from "@/components/ui/button";
import { addManualGap } from "@/lib/discovery/gap-actions";
import { useState } from "react";
import { toast } from "sonner";

/** Admin-only form to seed a knowledge gap by hand (drives discovery). */
export function AddGapForm() {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await addManualGap(question.trim());
      toast.success("Gap added. Run discovery to find sources for it.");
      setQuestion("");
    } catch {
      toast.error("Could not add the gap. Check the question and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-5"
    >
      <h2 className="text-lg font-medium text-charcoal">Add a gap</h2>
      <p className="text-sm text-muted-gray">
        Seed a question the knowledge base should cover. It enters the same queue as gaps from real
        user questions.
      </p>
      <input
        aria-label="Gap question"
        placeholder="e.g. When is the HPV booster due?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={200}
        className="w-full rounded border border-[#eceae4] bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-muted-gray"
      />
      <Button type="submit" disabled={pending || !question.trim()}>
        {pending ? "Adding…" : "Add gap"}
      </Button>
    </form>
  );
}
