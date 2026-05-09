import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EVENTS_PROMPT, EmptyState, NEWS_PROMPT, PROMPT_SUGGESTIONS } from "./empty-state";

describe("EmptyState", () => {
  it("renders the lead text from the original empty state", () => {
    render(<EmptyState onPrompt={() => {}} />);
    expect(screen.getByText(/Ask a cervical-health question to get started/i)).toBeInTheDocument();
  });

  it("renders all six prompt suggestion pills", () => {
    render(<EmptyState onPrompt={() => {}} />);
    for (const text of PROMPT_SUGGESTIONS) {
      expect(screen.getByRole("button", { name: text })).toBeInTheDocument();
    }
  });

  it("renders the News and Events entry-point cards", () => {
    render(<EmptyState onPrompt={() => {}} />);
    expect(screen.getByRole("button", { name: /Latest women's health news/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Events near you/i })).toBeInTheDocument();
  });

  it("calls onPrompt with the prompt text when a pill is clicked", () => {
    const onPrompt = vi.fn();
    render(<EmptyState onPrompt={onPrompt} />);
    fireEvent.click(screen.getByRole("button", { name: PROMPT_SUGGESTIONS[0] }));
    expect(onPrompt).toHaveBeenCalledWith(PROMPT_SUGGESTIONS[0]);
  });

  it("calls onPrompt with the fixed news trigger string when the News card is clicked", () => {
    const onPrompt = vi.fn();
    render(<EmptyState onPrompt={onPrompt} />);
    fireEvent.click(screen.getByRole("button", { name: /Latest women's health news/i }));
    expect(onPrompt).toHaveBeenCalledWith(NEWS_PROMPT);
  });

  it("calls onPrompt with the fixed events trigger string when the Events card is clicked", () => {
    const onPrompt = vi.fn();
    render(<EmptyState onPrompt={onPrompt} />);
    fireEvent.click(screen.getByRole("button", { name: /Events near you/i }));
    expect(onPrompt).toHaveBeenCalledWith(EVENTS_PROMPT);
  });

  it("disables every button when disabled prop is true", () => {
    render(<EmptyState onPrompt={() => {}} disabled />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
