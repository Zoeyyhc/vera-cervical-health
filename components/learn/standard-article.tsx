"use client";

import { useEffect, useMemo, useState } from "react";
import type { Article, StandardSection } from "@/lib/learn/articles";
import { ArticleHeader } from "./article-header";
import { RightRail, MobileCTABar } from "./right-rail";
import { RelatedRow } from "./related-row";
import { Attribution } from "./attribution";
import { Leaf } from "./botanical";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function StandardArticle({
  article,
  body,
}: {
  article: Article;
  body: StandardSection[];
}) {
  const headings = useMemo(
    () =>
      body
        .filter((s): s is { type: "h2"; text: string } => s.type === "h2")
        .map((h) => ({ id: slugify(h.text), text: h.text })),
    [body]
  );
  const [active, setActive] = useState(headings[0]?.id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [headings]);

  return (
    <>
      <div className="mx-auto max-w-[1200px] px-6">
        <ArticleHeader article={article} />

        <details className="lg:hidden surface-card p-4 mb-8">
          <summary className="cursor-pointer text-[14px] font-semibold text-muted-foreground">
            On this page
          </summary>
          <ul className="mt-3 space-y-2">
            {headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className="text-[14px]">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </details>

        <div className="lg:grid lg:grid-cols-[200px_minmax(0,720px)_200px] lg:gap-8 pb-32 lg:pb-16">
          <nav className="hidden lg:block sticky top-24 self-start">
            <p className="text-[14px] font-semibold text-muted-foreground mb-4">On this page</p>
            <ul>
              {headings.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    className={`block py-2 text-[14px] pl-3 transition-colors ${
                      active === h.id
                        ? "text-foreground border-l-2"
                        : "text-muted-foreground border-l-2 border-transparent"
                    }`}
                    style={
                      active === h.id
                        ? { borderColor: "color-mix(in oklab, var(--color-sage) 80%, transparent)" }
                        : undefined
                    }
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="max-w-[720px] body-md">
            {body.map((s, i) => {
              if (s.type === "p") {
                return (
                  <p key={i} className="mt-5 first:mt-0">
                    {s.text}
                  </p>
                );
              }
              if (s.type === "h2") {
                const id = slugify(s.text);
                return (
                  <h2
                    key={i}
                    id={id}
                    className="h-article-2 mt-12 flex items-center gap-3 scroll-mt-24"
                  >
                    <Leaf className="w-4 h-4 opacity-70" />
                    {s.text}
                  </h2>
                );
              }
              if (s.type === "quote") {
                return (
                  <div key={i} className="mt-6">
                    <blockquote className="quote-block">"{s.text}"</blockquote>
                    <p className="caption quote-attr mt-2">Source: {s.source}</p>
                  </div>
                );
              }
              if (s.type === "ul") {
                return (
                  <ul key={i} className="mt-4 space-y-2 list-disc pl-6">
                    {s.items.map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                );
              }
              if (s.type === "cta") {
                return (
                  <div key={i} className="mt-12 text-center">
                    <a href={s.href} className="btn-primary">
                      {s.text}
                    </a>
                  </div>
                );
              }
              return null;
            })}

            <RelatedRow slug={article.slug} />
            <Attribution />
          </article>

          <RightRail title={article.title} />
        </div>
      </div>
      <MobileCTABar title={article.title} />
    </>
  );
}
