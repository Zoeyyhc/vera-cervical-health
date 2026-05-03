import { LandingButton } from "@/components/landing/landing-button";
import { Leaf } from "@/components/landing/leaf";
import Link from "next/link";

const bullets = [
  "Cited from medical sources you can verify",
  "Powered by Claude, with safety guardrails",
  "Will always recommend a professional when it matters",
];

export function AskAnything() {
  return (
    <section className="section-pad">
      <div className="container-cervix grid gap-16 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="heading-sub">
            Ask anything you'd ask a doctor — without booking the appointment.
          </h2>
          <p className="body-large mt-6 text-muted-gray">
            The Cervix assistant answers in plain language, cites its sources, and never replaces a
            clinician. Your conversations stay private.
          </p>
          <ul className="mt-8 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <Leaf size={18} className="mt-1 shrink-0 text-foreground/80" />
                <span className="body-base">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-container border border-border bg-card p-6">
          <p className="caption text-muted-gray">You</p>
          <p className="body-base mt-1">What does a HPV-positive result actually mean?</p>
          <div className="mt-6 border-t border-border pt-6">
            <p className="caption text-muted-gray">Cervix</p>
            <p className="body-base mt-1">
              A positive HPV result means the virus was detected — it does not mean you have cancer.
              Most HPV infections clear on their own within one to two years. Your doctor will
              usually recommend a follow-up to monitor any changes to cervical cells.
            </p>
            <p className="caption mt-4 text-muted-gray">Source: Cancer Council Australia</p>
          </div>
          <div className="mt-6">
            <Link href="/chat">
              <LandingButton className="rounded-pill px-4 py-1.5 text-sm">Try it →</LandingButton>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
