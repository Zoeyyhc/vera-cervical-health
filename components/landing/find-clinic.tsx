"use client";

import { LandingButton } from "@/components/landing/landing-button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export function FindClinic() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    const target = trimmed ? `/clinics?q=${encodeURIComponent(trimmed)}` : "/clinics";
    router.push(target);
  }

  return (
    <section className="section-pad">
      <div className="container-cervix">
        <h2 className="heading-sub">Find a screening clinic near you.</h2>
        <p className="body-base mt-4 text-muted-gray">
          Powered by Google Maps. Search by suburb or postcode.
        </p>
        <form
          onSubmit={onSubmit}
          className="mt-8 flex w-full max-w-[600px] flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="clinic-query" className="sr-only">
            Suburb or postcode
          </label>
          <input
            id="clinic-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Carlton or 3053"
            className="w-full rounded-standard border border-border bg-background px-4 py-2.5 text-base placeholder:text-muted-gray focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-[480px]"
          />
          <LandingButton type="submit">Find clinics</LandingButton>
        </form>
        <Image
          src="/landing/map-illustration.png"
          alt=""
          aria-hidden="true"
          width={1024}
          height={768}
          loading="lazy"
          className="mt-12 h-auto w-full max-w-[640px] opacity-80"
        />
      </div>
    </section>
  );
}
