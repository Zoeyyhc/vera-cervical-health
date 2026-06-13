"use client";

import { LandingButton } from "@/components/landing/landing-button";
import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { label: "Learn", href: "/learn" },
  { label: "Find a clinic", href: "/clinics" },
  { label: "Sign in", href: "/login" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-background/85 backdrop-blur-sm transition-colors ${
        scrolled ? "border-b border-border" : ""
      }`}
    >
      <nav className="container-cervix flex h-16 items-center justify-between">
        <Link href="/" className="text-[18px] font-semibold tracking-tight">
          Vera
        </Link>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-base hover:underline underline-offset-4">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/chat" className="hidden md:inline-flex">
          <LandingButton>Try the assistant</LandingButton>
        </Link>
        <button
          type="button"
          aria-label="Menu"
          className="md:hidden rounded-standard border border-charcoal/40 p-2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M3 7h18M3 12h18M3 17h18" />
          </svg>
        </button>
      </nav>
    </header>
  );
}
