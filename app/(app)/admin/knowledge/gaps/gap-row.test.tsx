// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GapRow } from "./gap-row";

const base = {
  id: "g1",
  question: "When is the HPV booster due?",
  topScore: 0.41,
  source: "user" as const,
  createdAt: "2026-06-20T00:00:00Z",
  addressed: false,
};

describe("GapRow", () => {
  test("renders the question and a User source badge", () => {
    render(<GapRow gap={base} />);
    expect(screen.getByText(/when is the hpv booster due\?/i)).toBeInTheDocument();
    expect(screen.getByText(/^user$/i)).toBeInTheDocument();
  });

  test("shows a Manual badge for manual gaps", () => {
    render(<GapRow gap={{ ...base, source: "manual" }} />);
    expect(screen.getByText(/^manual$/i)).toBeInTheDocument();
  });

  test("shows an Addressed badge only when addressed", () => {
    const { rerender } = render(<GapRow gap={base} />);
    expect(screen.queryByText(/addressed/i)).not.toBeInTheDocument();
    rerender(<GapRow gap={{ ...base, addressed: true }} />);
    expect(screen.getByText(/addressed/i)).toBeInTheDocument();
  });

  test("renders an em dash when topScore is null", () => {
    render(<GapRow gap={{ ...base, topScore: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
