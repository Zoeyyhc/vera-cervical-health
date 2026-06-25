// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/discovery/gap-actions", () => ({ addManualGap: vi.fn() }));

import { addManualGap } from "@/lib/discovery/gap-actions";
import { toast } from "sonner";
import { AddGapForm } from "./add-gap-form";

describe("AddGapForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("submits the question and toasts success", async () => {
    vi.mocked(addManualGap).mockResolvedValue(undefined);
    render(<AddGapForm />);

    fireEvent.change(screen.getByLabelText(/gap question/i), {
      target: { value: "When is the HPV booster due?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add gap/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(addManualGap).toHaveBeenCalledWith("When is the HPV booster due?");
  });

  test("toasts an error when the action rejects", async () => {
    vi.mocked(addManualGap).mockRejectedValue(new Error("fail"));
    render(<AddGapForm />);

    fireEvent.change(screen.getByLabelText(/gap question/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /add gap/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
