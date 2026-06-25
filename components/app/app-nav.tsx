"use client";

import { SignOutButton } from "@/components/auth/sign-out-button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { label: "Chat", href: "/chat" },
  { label: "Clinics", href: "/clinics" },
  { label: "Learn", href: "/learn" },
];

export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
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
        <Link href="/chat" className="text-[18px] font-semibold tracking-tight">
          Vera
        </Link>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => {
            const isActive = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`text-base underline-offset-4 hover:underline ${
                    isActive ? "underline" : ""
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
          {isAdmin ? (
            <li>
              <Link
                href="/admin/knowledge"
                className={`text-base underline-offset-4 hover:underline ${
                  pathname.startsWith("/admin") ? "underline" : ""
                }`}
                aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              >
                Admin
              </Link>
            </li>
          ) : null}
        </ul>
        <div className="hidden md:inline-flex">
          <SignOutButton />
        </div>
      </nav>
    </header>
  );
}
