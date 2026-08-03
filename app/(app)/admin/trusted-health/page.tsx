import { requireAdmin } from "@/lib/auth/require-admin";
import {
  eventOrganiserOptions,
  isExpired,
  listDirectoryLinks,
  listTrustedSources,
  listVerifiedEvents,
} from "@/lib/mcp/admin";
import { setDirectoryLinkStatus, setEventStatus, setSourceStatus } from "@/lib/mcp/admin-actions";
import Link from "next/link";
import { AddEventForm } from "./add-event-form";
import { StatusButtons, StatusPill } from "./status-buttons";

/**
 * Minimal governance surface for the Victoria Trusted Health MCP (spec §3:
 * "A source-management UI beyond the smallest admin approval surfaces needed to
 * operate v0.1" is explicitly out of scope).
 *
 * The point of this page is that everything the MCP can return is visible here
 * with its approval state — and that pending and expired rows are shown as
 * clearly not live.
 */

export const dynamic = "force-dynamic";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function TrustedHealthPage() {
  const { supabase } = await requireAdmin();
  const [sources, events, links] = await Promise.all([
    listTrustedSources(supabase),
    listVerifiedEvents(supabase),
    listDirectoryLinks(supabase),
  ]);

  const organisers = eventOrganiserOptions(sources);
  const now = new Date();
  const liveEvents = events.filter((e) => e.status === "approved" && !isExpired(e, now));

  return (
    <main className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-charcoal">Victoria trusted health</h1>
            <p className="mt-1 text-sm text-muted-gray">
              {sources.filter((s) => s.status === "approved").length} approved source
              {sources.filter((s) => s.status === "approved").length === 1 ? "" : "s"} ·{" "}
              {liveEvents.length} live event{liveEvents.length === 1 ? "" : "s"} ·{" "}
              {links.filter((l) => l.status === "approved").length} directory link
              {links.filter((l) => l.status === "approved").length === 1 ? "" : "s"}
            </p>
          </div>
          <Link href="/admin/knowledge" className="text-sm text-charcoal underline">
            Knowledge review →
          </Link>
        </header>

        {/* ───── sources ───── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-charcoal">Source registry</h2>
            <p className="mt-1 text-sm text-muted-gray">
              Allowlist-only. The MCP returns nothing that does not trace back to an approved source
              here — revoking one hides its content, directory links, and events immediately.
            </p>
          </div>

          <ul className="space-y-3">
            {sources.map((source) => (
              <li key={source.id} className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal">{source.organisation}</p>
                    <p className="truncate text-sm text-muted-gray">{source.canonical_host}</p>
                    <p className="mt-1 text-xs text-muted-gray">
                      {source.source_class.replace(/_/g, " ")} · {source.jurisdiction} ·{" "}
                      {source.permitted_content.join(", ") || "no permitted use"}
                      {source.next_review_at ? ` · review due ${source.next_review_at}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusPill status={source.status} live={source.status === "approved"} />
                    <StatusButtons
                      id={source.id}
                      status={source.status}
                      approve={{ value: "approved", label: "Approve", done: "Source approved." }}
                      withdraw={{ value: "revoked", label: "Revoke", done: "Source revoked." }}
                      action={setSourceStatus}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ───── events ───── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-charcoal">Events</h2>
            <p className="mt-1 text-sm text-muted-gray">
              Entered by hand and invisible until approved. Expiry is derived from the dates below,
              so an expired event stops being returned without any action.
            </p>
          </div>

          <AddEventForm organisers={organisers} />

          {events.length === 0 ? (
            <p className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-6 text-center text-sm text-muted-gray">
              No events yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const expired = isExpired(event, now);
                const live = event.status === "approved" && !expired;
                return (
                  <li
                    key={event.id}
                    className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-charcoal">{event.name}</p>
                        <p className="text-sm text-muted-gray">
                          {formatDateTime(event.starts_at)}
                          {event.ends_at ? ` – ${formatDateTime(event.ends_at)}` : ""} ·{" "}
                          {event.location_label} · {event.format.replace("_", "-")}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-gray">
                          {event.organisation} ·{" "}
                          <a
                            href={event.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            source
                          </a>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {expired ? <StatusPill status="expired" live={false} /> : null}
                        <StatusPill status={event.status} live={live} />
                        <StatusButtons
                          id={event.id}
                          status={event.status}
                          approve={{
                            value: "approved",
                            label: "Approve",
                            done: "Event approved.",
                          }}
                          withdraw={{
                            value: "rejected",
                            label: "Reject",
                            done: "Event rejected.",
                          }}
                          action={setEventStatus}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ───── directory links ───── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-charcoal">Directory links</h2>
            <p className="mt-1 text-sm text-muted-gray">
              Deep links into first-party directories. Vera stores no provider records. A template
              containing <code>{"{location}"}</code> receives the user&rsquo;s suburb or postcode;
              one without it is returned as-is.
            </p>
          </div>

          <ul className="space-y-3">
            {links.map((link) => (
              <li key={link.id} className="rounded-lg border border-[#eceae4] bg-[#fcfbf8] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-charcoal">{link.directory_name}</p>
                    <p className="truncate text-sm text-muted-gray">{link.search_url_template}</p>
                    <p className="mt-1 text-xs text-muted-gray">
                      {link.organisation}
                      {link.supports.length > 0 ? ` · supports ${link.supports.join(", ")}` : ""}
                      {link.next_review_at ? ` · review due ${link.next_review_at}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusPill status={link.status} live={link.status === "approved"} />
                    <StatusButtons
                      id={link.id}
                      status={link.status}
                      approve={{ value: "approved", label: "Approve", done: "Link approved." }}
                      withdraw={{ value: "retired", label: "Retire", done: "Link retired." }}
                      action={setDirectoryLinkStatus}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
