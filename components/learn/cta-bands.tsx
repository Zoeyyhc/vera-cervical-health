"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export function AskAIBand() {
  return (
    <section className="border-y border-border">
      <div className="mx-auto max-w-[1200px] px-6 py-16 grid gap-10 md:grid-cols-2 items-center">
        <div>
          <h2 className="h-article-2">Have a question we haven't answered?</h2>
          <p className="body-md text-muted-foreground mt-3 max-w-md">
            Ask the Vera assistant. Every answer cites its sources, and it will always recommend a
            clinician when the question needs one.
          </p>
          <a href="/chat" className="btn-primary mt-6">
            Open the assistant <ArrowRight className="w-4 h-4" />
          </a>
        </div>
        <div className="surface-card p-6 max-w-md md:ml-auto">
          <div className="caption">You</div>
          <p className="body-md mt-1">What does a HPV-positive result actually mean?</p>
          <div className="caption mt-5">Assistant</div>
          <p className="body-md mt-1">
            A positive result means HPV was detected. Most infections clear on their own within two
            years. Your clinician will guide next steps based on the type detected and your
            screening history.
          </p>
          <p className="caption mt-3">Source: Cancer Council Australia</p>
        </div>
      </div>
    </section>
  );
}

export function FindClinicBand() {
  const router = useRouter();
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-16">
      <div className="max-w-2xl">
        <h2 className="h-article-2">Ready to book?</h2>
        <p className="body-md text-muted-foreground mt-2">Find a screening clinic near you.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/clinics");
          }}
          className="mt-6 flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            placeholder="e.g. Carlton or 3053"
            className="input-cream flex-1 sm:max-w-[480px]"
          />
          <button type="submit" className="btn-primary">
            Find clinics
          </button>
        </form>
      </div>
    </section>
  );
}
