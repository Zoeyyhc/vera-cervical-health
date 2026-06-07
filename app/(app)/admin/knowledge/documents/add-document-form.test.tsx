// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rag/document-actions", () => ({ addDocument: vi.fn() }));

import { addDocument } from "@/lib/rag/document-actions";
import { toast } from "sonner";
import { AddDocumentForm } from "./add-document-form";

describe("AddDocumentForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("submits name + content and toasts the chunk count", async () => {
    vi.mocked(addDocument).mockResolvedValue({ chunksCreated: 4 });
    render(<AddDocumentForm />);

    fireEvent.change(screen.getByLabelText(/document name/i), { target: { value: "Cervical basics" } });
    fireEvent.change(screen.getByLabelText(/document content/i), { target: { value: "Some text" } });
    fireEvent.click(screen.getByRole("button", { name: /add to knowledge base/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(addDocument).toHaveBeenCalledWith({ name: "Cervical basics", content: "Some text" });
  });

  test("toasts an error when the action rejects", async () => {
    vi.mocked(addDocument).mockRejectedValue(new Error("fail"));
    render(<AddDocumentForm />);

    fireEvent.change(screen.getByLabelText(/document name/i), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/document content/i), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: /add to knowledge base/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
