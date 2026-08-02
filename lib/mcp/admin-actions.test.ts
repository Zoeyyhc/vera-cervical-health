// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { createVerifiedEvent, setEventStatus, setSourceStatus } from "./admin-actions";

/**
 * Spec §6 events lifecycle, and acceptance criterion 3: an event appears only
 * after admin approval. The property worth pinning down is that creation cannot
 * publish — no matter what the caller sends.
 */

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

function fakeAdmin(
  source: unknown = { id: SOURCE_ID, status: "approved", permitted_content: ["events"] }
) {
  const single = vi.fn().mockResolvedValue({ data: source, error: null });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const client = { from: vi.fn().mockReturnValue({ select, insert, update }) };
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: client as never,
    user: { id: "admin-1" } as never,
  });
  return { client, insert, update };
}

const VALID_EVENT = {
  sourceId: SOURCE_ID,
  name: "Cervical screening information session",
  startsAt: "2026-09-01T10:00:00+10:00",
  endsAt: "2026-09-01T12:00:00+10:00",
  locationLabel: "Carlton 3053",
  format: "in_person" as const,
  topic: "cervical_screening" as const,
  registrationUrl: "https://www.cancervic.org.au/register",
  sourceUrl: "https://www.cancervic.org.au/event",
};

describe("createVerifiedEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  test("always inserts as pending — creation cannot publish", async () => {
    const { insert } = fakeAdmin();

    await createVerifiedEvent(VALID_EVENT);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", created_by: "admin-1" })
    );
  });

  test("ignores a status the caller tries to supply", async () => {
    const { insert } = fakeAdmin();

    // The schema strips unknown keys, so an injected status never reaches the DB.
    await createVerifiedEvent({ ...VALID_EVENT, status: "approved" } as never);

    expect(insert.mock.calls[0][0].status).toBe("pending");
  });

  test("rejects an organiser that is not approved for events", async () => {
    fakeAdmin({ id: SOURCE_ID, status: "approved", permitted_content: ["health_content"] });

    await expect(createVerifiedEvent(VALID_EVENT)).rejects.toThrow(
      "that organiser is not approved for events"
    );
  });

  test("rejects a revoked organiser", async () => {
    fakeAdmin({ id: SOURCE_ID, status: "revoked", permitted_content: ["events"] });

    await expect(createVerifiedEvent(VALID_EVENT)).rejects.toThrow(
      "that organiser is not approved for events"
    );
  });

  test("rejects an in-person event outside Victoria", async () => {
    fakeAdmin();

    await expect(
      createVerifiedEvent({ ...VALID_EVENT, locationLabel: "Sydney 2000" })
    ).rejects.toThrow();
  });

  test("allows an online event with a non-geographic location", async () => {
    const { insert } = fakeAdmin();

    await createVerifiedEvent({
      ...VALID_EVENT,
      format: "online",
      locationLabel: "Online webinar",
    });

    expect(insert).toHaveBeenCalled();
  });

  test("rejects an end time before the start time", async () => {
    fakeAdmin();

    await expect(
      createVerifiedEvent({ ...VALID_EVENT, endsAt: "2026-08-01T10:00:00+10:00" })
    ).rejects.toThrow();
  });

  test.each([
    ["a non-https registration URL", { registrationUrl: "http://insecure.test/register" }],
    ["a javascript URL", { registrationUrl: "javascript:alert(1)" }],
    ["a non-https source URL", { sourceUrl: "http://insecure.test/event" }],
  ])("rejects %s", async (_label, override) => {
    fakeAdmin();

    await expect(createVerifiedEvent({ ...VALID_EVENT, ...override })).rejects.toThrow();
  });

  test("stores an absent end time and topic as null", async () => {
    const { insert } = fakeAdmin();

    await createVerifiedEvent({ ...VALID_EVENT, endsAt: "", topic: "" });

    expect(insert.mock.calls[0][0]).toMatchObject({ ends_at: null, topic: null });
  });
});

describe("setEventStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  test("stamps the reviewer and review time on approval", async () => {
    const { update } = fakeAdmin();

    await setEventStatus({ id: EVENT_ID, status: "approved" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        reviewed_by: "admin-1",
        reviewed_at: expect.any(String),
      })
    );
  });

  test("rejects a status outside the allowed set", async () => {
    fakeAdmin();

    await expect(setEventStatus({ id: EVENT_ID, status: "published" as never })).rejects.toThrow();
  });

  test("rejects a non-uuid id", async () => {
    fakeAdmin();

    await expect(setEventStatus({ id: "'; drop table", status: "approved" })).rejects.toThrow();
  });
});

describe("setSourceStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  test("records the approver when approving", async () => {
    const { update } = fakeAdmin();

    await setSourceStatus({ id: SOURCE_ID, status: "approved" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", approved_by: "admin-1" })
    );
  });

  test("revoking does not stamp an approver", async () => {
    const { update } = fakeAdmin();

    await setSourceStatus({ id: SOURCE_ID, status: "revoked" });

    expect(update.mock.calls[0][0]).not.toHaveProperty("approved_by");
  });

  test("every action goes through the admin gate", async () => {
    fakeAdmin();

    await setSourceStatus({ id: SOURCE_ID, status: "approved" });

    expect(requireAdmin).toHaveBeenCalled();
  });
});
