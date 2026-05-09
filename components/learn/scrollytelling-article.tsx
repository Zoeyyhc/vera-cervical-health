"use client";

import { useEffect, useRef, useState } from "react";
import type { Article } from "@/lib/learn/articles";
import { screeningSteps } from "@/lib/learn/articles";
import { ArticleHeader } from "./article-header";
import { RelatedRow } from "./related-row";
import { Attribution } from "./attribution";
import { MobileCTABar } from "./right-rail";
import { FernFrond, Leaf, WillowSprig, Branch, Ginkgo, Eucalyptus } from "./botanical";

const Illustrations: Record<string, React.ComponentType<{ className?: string }>> = {
  envelope: FernFrond,
  calendar: Ginkgo,
  chair: WillowSprig,
  leaf: Leaf,
  swab: Branch,
  door: Eucalyptus,
};

export function ScrollytellingArticle({ article }: { article: Article }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            setActive(i);
          }
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <div className="mx-auto max-w-[1200px] px-6 pb-32 lg:pb-16">
        <ArticleHeader article={article} />

        <div className="max-w-[720px] mx-auto body-md">
          <p>
            If this is your first cervical screening, or your first one in a long time, you may be
            feeling some mix of nervous, awkward, or unsure what's about to happen. Most of that can
            be eased by knowing exactly what the appointment involves. The procedure is short, the
            discomfort is mild for most people, and there is more flexibility than you might think.
          </p>
        </div>

        <div className="lg:hidden sticky top-16 z-30 -mx-6 px-6 py-3 bg-background border-b border-border">
          <div className="flex gap-1.5">
            {screeningSteps.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full"
                style={{
                  background:
                    i <= active ? "var(--color-foreground)" : "var(--color-border)",
                }}
              />
            ))}
          </div>
          <p className="caption mt-2">
            Step {screeningSteps[active]?.number} - {screeningSteps[active]?.title}
          </p>
        </div>

        <div className="mt-16 lg:grid lg:grid-cols-[280px_1fr] lg:gap-12">
          <nav className="hidden lg:block sticky top-24 self-start">
            <ul className="space-y-6">
              {screeningSteps.map((s, i) => {
                const isActive = i === active;
                return (
                  <li key={s.number}>
                    <button
                      type="button"
                      onClick={() =>
                        refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                      className={`text-left pl-4 block w-full transition-colors ${
                        isActive ? "border-l-2" : "border-l-2 border-transparent"
                      }`}
                      style={
                        isActive
                          ? { borderColor: "color-mix(in oklab, var(--color-sage) 80%, transparent)" }
                          : undefined
                      }
                    >
                      <p
                        className={`text-[12px] uppercase tracking-[0.5px] ${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        }`}
                        style={{ fontWeight: 600 }}
                      >
                        Step {s.number}
                      </p>
                      <p
                        className={`text-[18px] mt-1 ${
                          isActive ? "text-foreground font-semibold" : "text-muted-foreground"
                        }`}
                      >
                        {s.title}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-y-24 lg:space-y-32">
            {screeningSteps.map((s, i) => {
              const Ill = Illustrations[s.illustration];
              return (
                <section
                  key={s.number}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  data-index={i}
                  className="lg:min-h-[60vh] flex flex-col items-center"
                >
                  <div className="relative w-[280px] h-[280px] flex items-center justify-center">
                    <div className="absolute inset-0 wash-sage opacity-70 rounded-full blur-2xl" />
                    <Ill className="relative w-44 h-44" />
                  </div>
                  <div className="max-w-[480px] mt-8">
                    <p
                      className="text-[14px] uppercase tracking-[0.5px] text-muted-foreground"
                      style={{ fontWeight: 600 }}
                    >
                      Step {s.number}
                    </p>
                    <h2 className="h-article-2 mt-2">{s.title}</h2>
                    <p className="body-md mt-4">{s.body}</p>
                    {s.quote && (
                      <div className="mt-5">
                        <blockquote className="quote-block">"{s.quote.text}"</blockquote>
                        <p className="caption quote-attr mt-2">Source: {s.quote.source}</p>
                      </div>
                    )}
                  </div>
                  {i < screeningSteps.length - 1 && (
                    <div className="w-full max-w-[480px] border-t border-border mt-12" />
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <div className="max-w-[720px] mx-auto mt-24 body-md">
          <h2 className="h-article-2">After the test</h2>
          <p className="mt-4">
            Some light spotting is normal in the hours after the test. Otherwise, you can return to
            your day. Results typically arrive within two weeks via mail or your patient portal.
          </p>
          <h2 className="h-article-2 mt-10">Tips if you're nervous</h2>
          <p className="mt-4">
            Bring a friend if it helps. Ask for the smaller speculum. Tell the clinician this is
            your first time. You can pause or stop at any moment - that's not awkward, it's
            expected.
          </p>
          <div className="mt-12 text-center">
            <a href="/clinics" className="btn-primary">
              Find a screening clinic near you
            </a>
          </div>

          <RelatedRow slug={article.slug} />
          <Attribution />
        </div>
      </div>
      <MobileCTABar title={article.title} />
    </>
  );
}
