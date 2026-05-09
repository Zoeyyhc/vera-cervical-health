import type { GroupedSessions } from "@/lib/chat/sessions";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs alongside vi.mock (top of file) so the mocks exist by the
// time the mock factories execute.
const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  pathnameMock: vi.fn(() => "/chat" as string),
  starMock: vi.fn(),
  unstarMock: vi.fn(),
  softDeleteMock: vi.fn(),
  undoDeleteMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastMessageMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathnameMock(),
  useRouter: () => ({ push: mocks.pushMock, refresh: mocks.refreshMock }),
}));

vi.mock("@/lib/chat/session-actions", () => ({
  starSession: (...args: unknown[]) => mocks.starMock(...args),
  unstarSession: (...args: unknown[]) => mocks.unstarMock(...args),
  softDeleteSession: (...args: unknown[]) => mocks.softDeleteMock(...args),
  undoDeleteSession: (...args: unknown[]) => mocks.undoDeleteMock(...args),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(mocks.toastMessageMock, { error: mocks.toastErrorMock }),
}));

import { ChatSidebarClient } from "./chat-sidebar-client";

const grouped: GroupedSessions = {
  starred: [
    {
      id: "star-1",
      displayTitle: "Pap smear questions",
      updatedAt: "2026-05-08T10:00:00Z",
      starredAt: "2026-05-08T10:00:00Z",
    },
  ],
  recent: [
    {
      id: "rec-1",
      displayTitle: "When to start screening",
      updatedAt: "2026-05-09T10:00:00Z",
      starredAt: null,
    },
    {
      id: "rec-2",
      displayTitle: "Cervical biopsy follow-up",
      updatedAt: "2026-05-07T10:00:00Z",
      starredAt: null,
    },
  ],
};

beforeEach(() => {
  mocks.pushMock.mockReset();
  mocks.refreshMock.mockReset();
  mocks.pathnameMock.mockReturnValue("/chat");
  mocks.starMock.mockReset().mockResolvedValue(undefined);
  mocks.unstarMock.mockReset().mockResolvedValue(undefined);
  mocks.softDeleteMock.mockReset().mockResolvedValue(undefined);
  mocks.undoDeleteMock.mockReset().mockResolvedValue(undefined);
  mocks.toastErrorMock.mockReset();
  mocks.toastMessageMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChatSidebarClient", () => {
  it("renders the STARRED heading only when there is at least one starred session", () => {
    render(<ChatSidebarClient grouped={grouped} />);
    expect(screen.getByText(/STARRED/i)).toBeInTheDocument();
    expect(screen.getByText(/RECENT/i)).toBeInTheDocument();
    expect(screen.getByText("Pap smear questions")).toBeInTheDocument();
  });

  it("hides the STARRED heading when no starred sessions exist", () => {
    render(<ChatSidebarClient grouped={{ starred: [], recent: grouped.recent }} />);
    expect(screen.queryByText(/STARRED/i)).toBeNull();
    expect(screen.getByText(/RECENT/i)).toBeInTheDocument();
  });

  it("re-renders with new sessions when the grouped prop changes (e.g. after router.refresh)", () => {
    const { rerender } = render(<ChatSidebarClient grouped={grouped} />);
    expect(screen.queryByText("Brand-new session")).toBeNull();

    const updated: GroupedSessions = {
      starred: grouped.starred,
      recent: [
        {
          id: "rec-new",
          displayTitle: "Brand-new session",
          updatedAt: "2026-05-10T01:00:00Z",
          starredAt: null,
        },
        ...grouped.recent,
      ],
    };
    rerender(<ChatSidebarClient grouped={updated} />);

    expect(screen.getByText("Brand-new session")).toBeInTheDocument();
  });

  it("calls starSession when an unstarred row's star icon is clicked", async () => {
    render(<ChatSidebarClient grouped={grouped} />);
    fireEvent.click(screen.getByLabelText("Star When to start screening"));
    await waitFor(() => expect(mocks.starMock).toHaveBeenCalledWith("rec-1"));
  });

  it("calls unstarSession when a starred row's star icon is clicked", async () => {
    render(<ChatSidebarClient grouped={grouped} />);
    fireEvent.click(screen.getByLabelText("Unstar Pap smear questions"));
    await waitFor(() => expect(mocks.unstarMock).toHaveBeenCalledWith("star-1"));
  });

  it("rolls back the optimistic star + shows a toast when starSession fails", async () => {
    mocks.starMock.mockRejectedValueOnce(new Error("boom"));
    render(<ChatSidebarClient grouped={grouped} />);
    fireEvent.click(screen.getByLabelText("Star When to start screening"));
    await waitFor(() => expect(mocks.toastErrorMock).toHaveBeenCalled());
    expect(screen.getByLabelText("Star When to start screening")).toBeInTheDocument();
  });

  it("removes the row, shows an Undo toast, and calls softDeleteSession when delete is chosen", async () => {
    render(<ChatSidebarClient grouped={grouped} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("More actions for When to start screening"));
    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteItem);

    await waitFor(() => expect(mocks.softDeleteMock).toHaveBeenCalledWith("rec-1"));
    expect(screen.queryByText("When to start screening")).toBeNull();
    expect(mocks.toastMessageMock).toHaveBeenCalledWith(
      "Conversation deleted.",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
        duration: 6000,
      })
    );
  });

  it("calls undoDeleteSession when the Undo toast action fires", async () => {
    render(<ChatSidebarClient grouped={grouped} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("More actions for When to start screening"));
    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteItem);

    await waitFor(() => expect(mocks.toastMessageMock).toHaveBeenCalled());
    const toastCall = mocks.toastMessageMock.mock.calls[0][1] as {
      action: { onClick: () => void };
    };
    toastCall.action.onClick();
    await waitFor(() => expect(mocks.undoDeleteMock).toHaveBeenCalledWith("rec-1"));
    expect(mocks.refreshMock).toHaveBeenCalled();
  });

  it("navigates to /chat when the active session is deleted", async () => {
    mocks.pathnameMock.mockReturnValue("/chat/rec-1");
    render(<ChatSidebarClient grouped={grouped} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("More actions for When to start screening"));
    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/i });
    await user.click(deleteItem);
    await waitFor(() => expect(mocks.pushMock).toHaveBeenCalledWith("/chat"));
  });
});
