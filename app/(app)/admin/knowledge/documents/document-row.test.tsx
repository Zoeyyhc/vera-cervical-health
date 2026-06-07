// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rag/document-actions", () => ({ deleteDocument: vi.fn() }));

import { deleteDocument } from "@/lib/rag/document-actions";
import { toast } from "sonner";
import { DocumentRow } from "./document-row";

const doc = { source: "who.int/hpv", title: "HPV", chunkCount: 8, createdAt: "2026-05-01T00:00:00.000Z" };

describe("DocumentRow", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  test("deletes after confirm and toasts success", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteDocument).mockResolvedValue();
    render(<DocumentRow doc={doc} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(deleteDocument).toHaveBeenCalledWith("who.int/hpv");
  });

  test("does nothing when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DocumentRow doc={doc} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(deleteDocument).not.toHaveBeenCalled();
  });
});
