"use client";

import { Button } from "@/components/ui/button";
import { createVerifiedEvent } from "@/lib/mcp/admin-actions";
import { EVENT_FORMATS, EVENT_TOPICS } from "@/lib/mcp/schemas";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Manual event entry — the only way an event enters v0.1 (spec §10 decision 2:
 * fully manual entry and approval, no candidate-import job, no SerpAPI).
 *
 * Submitting creates a `pending` row. It does not publish: an administrator
 * still has to approve it in the table below before the MCP will return it.
 */
export function AddEventForm({ organisers }: { organisers: Array<{ id: string; label: string }> }) {
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);

  if (organisers.length === 0) {
    return (
      <p className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-5 text-sm text-muted-gray">
        No approved organisers yet. Approve a source with the <code>events</code> permission before
        adding an event.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    try {
      await createVerifiedEvent({
        sourceId: String(form.get("sourceId")),
        name: String(form.get("name")),
        // `datetime-local` has no zone; these are Melbourne times, and +10:00 is
        // the state's standard offset. An admin entering a summer (AEDT) event
        // should adjust by an hour — noted in the field hint.
        startsAt: `${form.get("startsAt")}:00+10:00`,
        endsAt: form.get("endsAt") ? `${form.get("endsAt")}:00+10:00` : "",
        locationLabel: String(form.get("locationLabel")),
        format: String(form.get("format")) as (typeof EVENT_FORMATS)[number],
        topic: String(form.get("topic") ?? "") as (typeof EVENT_TOPICS)[number] | "",
        registrationUrl: String(form.get("registrationUrl")),
        sourceUrl: String(form.get("sourceUrl")),
      });
      toast.success("Event added as pending. Approve it below to make it visible.");
      setFormKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the event.");
    } finally {
      setPending(false);
    }
  }

  const field =
    "w-full rounded border border-[#eceae4] bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-muted-gray";
  const label = "block text-xs text-muted-gray";

  return (
    <form
      key={formKey}
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-5"
    >
      <h3 className="text-base font-medium text-charcoal">Add an event</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Organiser
          <select name="sourceId" required className={field}>
            {organisers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          Name
          <input name="name" required minLength={3} className={field} placeholder="Event name" />
        </label>

        <label className={label}>
          Starts (Melbourne time)
          <input name="startsAt" type="datetime-local" required className={field} />
        </label>

        <label className={label}>
          Ends (optional)
          <input name="endsAt" type="datetime-local" className={field} />
        </label>

        <label className={label}>
          Location
          <input
            name="locationLabel"
            required
            className={field}
            placeholder="Suburb or postcode, e.g. Carlton 3053"
          />
        </label>

        <label className={label}>
          Format
          <select name="format" required className={field}>
            {EVENT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.replace("_", "-")}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          Topic (optional)
          <select name="topic" className={field}>
            <option value="">—</option>
            {EVENT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          Registration URL
          <input
            name="registrationUrl"
            type="url"
            required
            className={field}
            placeholder="https://…"
          />
        </label>

        <label className={label}>
          Official source URL
          <input name="sourceUrl" type="url" required className={field} placeholder="https://…" />
        </label>
      </div>

      <p className="text-xs text-muted-gray">
        Times are entered as Melbourne standard time (UTC+10). For an event during daylight saving
        (AEDT), enter the time one hour earlier.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add as pending"}
      </Button>
    </form>
  );
}
