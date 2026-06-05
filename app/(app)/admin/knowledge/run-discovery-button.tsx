"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Triggers a discovery run via GET /api/embeddings/discover and toasts the
 * result. Note: blocks until the run finishes (up to RUN_BUDGET_MS ~4 min);
 * acceptable for a v1 admin tool. Revisit with a background-job UI if runs grow.
 */
export function RunDiscoveryButton() {
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      const res = await fetch("/api/embeddings/discover");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { gapsProcessed: number; candidatesStaged: number };
      toast.success(
        `Discovery complete — ${data.candidatesStaged} new candidate(s) from ${data.gapsProcessed} gap(s).`
      );
    } catch {
      toast.error("Discovery run failed. Check the server logs.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" onClick={run} disabled={pending}>
      {pending ? "Running…" : "Run discovery now"}
    </Button>
  );
}
