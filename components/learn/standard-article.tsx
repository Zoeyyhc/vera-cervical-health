"use client";

import type { Article, StandardSection } from "@/lib/learn/articles";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArticleHeader } from "./article-header";
import { Attribution } from "./attribution";
import { Leaf } from "./botanical";
import { RelatedRow } from "./related-row";
import { MobileCTABar, RightRail } from "./right-rail";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Inline-only markdown renderer. Strips the default <p> wrapper so the
// rendered output composes inside the surrounding <p>/<li>. Supports
// **bold**, *italic*, and [text](href).
function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children: c }) => <>{c}</>,
        a: ({ href, children: c }) => (
          <a href={href} className="underline underline-offset-2">
            {c}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
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
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [headings]);

  const sectionKey = (s: StandardSection) => {
    switch (s.type) {
      case "p":
      case "h2":
        return `${s.type}:${s.text}`;
      case "quote":
        return `quote:${s.source}:${s.text}`;
      case "cta":
        return `cta:${s.href}:${s.text}`;
      case "ul":
      case "ol":
        return `${s.type}:${s.items.join("|")}`;
    }
  };

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
            {body.map((s) => {
              const k = sectionKey(s);
              if (s.type === "p") {
                return (
                  <p key={k} className="mt-5 first:mt-0">
                    <Md>{s.text}</Md>
                  </p>
                );
              }
              if (s.type === "h2") {
                const id = slugify(s.text);
                return (
                  <h2
                    key={k}
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
                  <div key={k} className="mt-6">
                    <blockquote className="quote-block">"{s.text}"</blockquote>
                    <p className="caption quote-attr mt-2">Source: {s.source}</p>
                  </div>
                );
              }
              if (s.type === "ul") {
                return (
                  <ul key={k} className="mt-4 space-y-2 list-disc pl-6">
                    {s.items.map((it) => (
                      <li key={it}>
                        <Md>{it}</Md>
                      </li>
                    ))}
                  </ul>
                );
              }
              if (s.type === "ol") {
                return (
                  <ol key={k} className="mt-4 space-y-2 list-decimal pl-6">
                    {s.items.map((it) => (
                      <li key={it}>
                        <Md>{it}</Md>
                      </li>
                    ))}
                  </ol>
                );
              }
              if (s.type === "cta") {
                return (
                  <div key={k} className="mt-12 text-center">
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
