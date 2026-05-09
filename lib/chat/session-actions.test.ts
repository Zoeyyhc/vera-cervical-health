import { describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: fromMock }),
}));

import {
  softDeleteSession,
  starSession,
  undoDeleteSession,
  unstarSession,
} from "./session-actions";

function setupChain(error: Error | null = null) {
  updateMock.mockReset();
  eqMock.mockReset();
  fromMock.mockReset();

  eqMock.mockResolvedValue({ error });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
}

// Properly-formed v4 UUID: '4' in version nibble, '8' in variant nibble.
const VALID_ID = "12345678-1234-4234-8234-123456789012";

describe("starSession", () => {
  it("writes a non-null starred_at on chat_sessions for the given id", async () => {
    setupChain();
    await starSession(VALID_ID);
    expect(fromMock).toHaveBeenCalledWith("chat_sessions");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ starred_at: expect.any(String) })
    );
    expect(eqMock).toHaveBeenCalledWith("id", VALID_ID);
  });

  it("rejects a non-uuid id", async () => {
    setupChain();
    await expect(starSession("not-a-uuid")).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("throws when the update errors", async () => {
    setupChain(new Error("rls denied"));
    await expect(starSession(VALID_ID)).rejects.toThrow("rls denied");
  });
});

describe("unstarSession", () => {
  it("clears starred_at to null", async () => {
    setupChain();
    await unstarSession(VALID_ID);
    expect(updateMock).toHaveBeenCalledWith({ starred_at: null });
    expect(eqMock).toHaveBeenCalledWith("id", VALID_ID);
  });

  it("rejects a non-uuid id", async () => {
    setupChain();
    await expect(unstarSession("nope")).rejects.toThrow();
  });
});

describe("softDeleteSession", () => {
  it("writes a non-null deleted_at on chat_sessions for the given id", async () => {
    setupChain();
    await softDeleteSession(VALID_ID);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    );
    expect(eqMock).toHaveBeenCalledWith("id", VALID_ID);
  });

  it("rejects a non-uuid id", async () => {
    setupChain();
    await expect(softDeleteSession("nope")).rejects.toThrow();
  });

  it("throws when the update errors", async () => {
    setupChain(new Error("rls denied"));
    await expect(softDeleteSession(VALID_ID)).rejects.toThrow("rls denied");
  });
});

describe("undoDeleteSession", () => {
  it("clears deleted_at to null", async () => {
    setupChain();
    await undoDeleteSession(VALID_ID);
    expect(updateMock).toHaveBeenCalledWith({ deleted_at: null });
    expect(eqMock).toHaveBeenCalledWith("id", VALID_ID);
  });

  it("rejects a non-uuid id", async () => {
    setupChain();
    await expect(undoDeleteSession("nope")).rejects.toThrow();
  });
});
