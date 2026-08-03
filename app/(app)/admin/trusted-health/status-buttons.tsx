"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Two-button approve/withdraw control shared by the sources, events, and
 * directory-links tables. Kept generic because all three follow the same
 * approve-or-don't shape and only the labels and action differ.
 */
export function StatusButtons<S extends string>({
  id,
  status,
  approve,
  withdraw,
  action,
}: {
  id: string;
  status: string;
  approve: { value: S; label: string; done: string };
  withdraw: { value: S; label: string; done: string };
  action: (input: { id: string; status: S }) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function run(value: S, done: string) {
    setPending(true);
    try {
      await action({ id, status: value });
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex gap-2">
      {status !== approve.value ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(approve.value, approve.done)}
        >
          {approve.label}
        </Button>
      ) : null}
      {status !== withdraw.value ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(withdraw.value, withdraw.done)}
        >
          {withdraw.label}
        </Button>
      ) : null}
    </div>
  );
}

/** Small status pill. `tone` marks the state that means "live to the MCP". */
export function StatusPill({ status, live }: { status: string; live: boolean }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs ${
        live
          ? "border-[#c8d8c4] bg-[#eef4ec] text-[#3d5c37]"
          : "border-[#eceae4] bg-cream text-muted-gray"
      }`}
    >
      {status}
    </span>
  );
}
