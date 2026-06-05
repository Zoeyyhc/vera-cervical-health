// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { RunDiscoveryButton } from "./run-discovery-button";

describe("RunDiscoveryButton", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  test("hits the discover endpoint and toasts the counts", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ gapsProcessed: 2, candidatesStaged: 3 }), { status: 200 })
      );
    render(<RunDiscoveryButton />);

    fireEvent.click(screen.getByRole("button", { name: /run discovery/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith("/api/embeddings/discover");
    expect((toast.success as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/3/);
  });

  test("toasts an error on a non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    render(<RunDiscoveryButton />);
    fireEvent.click(screen.getByRole("button", { name: /run discovery/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
