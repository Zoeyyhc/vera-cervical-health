"use client";

import type { Article } from "@/lib/learn/articles";
import { myths } from "@/lib/learn/articles";
import { useEffect, useRef } from "react";
import { ArticleHeader } from "./article-header";
import { Attribution } from "./attribution";
import { RelatedRow } from "./related-row";
import { MobileCTABar } from "./right-rail";

export function CardGridArticle({ article }: { article: Article }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cards = containerRef.current?.querySelectorAll<HTMLElement>("[data-card]");
    if (!cards) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("fade-up");
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.6 }
    );
    for (const c of Array.from(cards)) obs.observe(c);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <div className="mx-auto max-w-[1200px] px-6 pb-32 lg:pb-16">
        <ArticleHeader article={article} />

        <div className="max-w-[720px] mx-auto body-md">
          <p>
            We hear the same misconceptions about cervical health from very different people. Most
            of them are honest misreadings, not bad faith. Here are seven of the most common, with a
            plain-language reality and the source behind it.
          </p>
        </div>

        <div ref={containerRef} className="mt-16 grid gap-6 md:grid-cols-2">
          {myths.map((m) => (
            <article key={m.number} data-card className="surface-card p-8 opacity-0">
              <div className="text-[48px] font-semibold leading-none">{m.number}</div>
              <p
                className="text-[12px] uppercase tracking-[0.5px] text-muted-foreground mt-4"
                style={{ fontWeight: 600 }}
              >
                Myth
              </p>
              <p className="body-lg text-muted-foreground mt-1 line-through">{m.myth}</p>
              <p
                className="text-[12px] uppercase tracking-[0.5px] mt-5"
                style={{ fontWeight: 600 }}
              >
                Reality
              </p>
              <p className="body-lg font-semibold mt-1">{m.reality}</p>
              <p
                className="text-[12px] uppercase tracking-[0.5px] text-muted-foreground mt-5"
                style={{ fontWeight: 600 }}
              >
                Evidence
              </p>
              <blockquote className="quote-block mt-2 text-[14px]">"{m.evidence}"</blockquote>
              <p className="caption quote-attr mt-2">Source: {m.source}</p>
            </article>
          ))}
        </div>

        <div className="max-w-[720px] mx-auto mt-16 body-md text-center">
          <p className="text-muted-foreground">
            If you've heard another one we haven't covered, ask the assistant. Every answer cites
            its sources.
          </p>
          <a href="/chat" className="btn-primary mt-6 inline-flex">
            Have a question we didn't cover? Ask the AI
          </a>
        </div>

        <div className="max-w-[720px] mx-auto">
          <RelatedRow slug={article.slug} />
          <Attribution />
        </div>
      </div>
      <MobileCTABar title={article.title} />
    </>
  );
}
