// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/discovery/review-actions", () => ({
  approveCandidate: vi.fn().mockResolvedValue(undefined),
  rejectCandidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { approveCandidate, rejectCandidate } from "@/lib/discovery/review-actions";
import { toast } from "sonner";
import { CandidateCard } from "./candidate-card";

const candidate = {
  id: "c1",
  source_url: "https://who.int/hpv",
  title: "HPV basics",
  summary: "About HPV.",
  authority_score: 0.95,
  relevance_score: 0.8,
  domain_tags: ["hpv-vaccine"],
  gap_refs: ["g1", "g2"],
  raw_content: "HPV is a common virus. Get screened regularly.",
  created_at: "2026-06-01T00:00:00.000Z",
};

describe("CandidateCard", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders the title, summary, and addressed-gap count", () => {
    render(<CandidateCard candidate={candidate} />);
    expect(screen.getByText("HPV basics")).toBeInTheDocument();
    expect(screen.getByText("About HPV.")).toBeInTheDocument();
    expect(screen.getByText(/2 gap/i)).toBeInTheDocument();
  });

  test("Approve calls approveCandidate and toasts success", async () => {
    render(<CandidateCard candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(approveCandidate).toHaveBeenCalledWith("c1"));
    expect(toast.success).toHaveBeenCalled();
  });

  test("Reject calls rejectCandidate and toasts success", async () => {
    render(<CandidateCard candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(rejectCandidate).toHaveBeenCalledWith("c1"));
    expect(toast.success).toHaveBeenCalled();
  });

  test("toasts an error when the action throws", async () => {
    vi.mocked(approveCandidate).mockRejectedValueOnce(new Error("nope"));
    render(<CandidateCard candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
