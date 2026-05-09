import { Branch, FernFrond, Ginkgo, Leaf, WillowSprig } from "@/components/learn/botanical";
import { AskAIBand, FindClinicBand } from "@/components/learn/cta-bands";
import { SiteFooter } from "@/components/learn/site-footer";
import { type Category, articles } from "@/lib/learn/articles";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Learn - Cervix",
  description:
    "Plain-language explainers about HPV, cervical screening, the vaccine, and what your results mean. Cited sources, never a diagnosis.",
  openGraph: {
    title: "Learn - Cervix",
    description: "Plain-language cervical health education. Browse topics by what you need.",
  },
};

const categories: Category[] = ["HPV Basics", "Screening", "HPV Vaccine", "Myths and Facts"];

export default function LearnHubPage() {
  const featured = articles.find((a) => a.slug === "screening-appointment");

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative">
        <div className="mx-auto max-w-[1200px] px-6 py-24 md:py-28 text-center relative">
          <div className="absolute inset-x-0 top-10 mx-auto w-[640px] h-[320px] wash-rose pointer-events-none opacity-80 -z-10" />
          <p className="caption">The Learn hub</p>
          <h1 className="display-hero mt-6 mx-auto max-w-[720px]">Learn at your own pace.</h1>
          <p className="body-lg text-muted-foreground mt-6 mx-auto max-w-[640px]">
            Plain-language explainers about HPV, cervical screening, the vaccine, and what your
            results mean. Grounded in cited sources, never a diagnosis.
          </p>
          <FernFrond className="hidden md:block absolute right-12 top-20 w-20 h-20 text-foreground opacity-70" />
          <Branch className="hidden md:block absolute left-12 bottom-8 w-16 h-16 text-foreground opacity-50" />
        </div>
      </section>

      {/* Start here */}
      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="flex items-center gap-3">
          <Leaf className="w-6 h-6" />
          <h2 className="display-sub">Start here.</h2>
        </div>
        <p className="body-md text-muted-foreground mt-3">Pick the door that fits where you are.</p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              eyebrow: "New to all this",
              title: "Start with what HPV actually is",
              body: "A 4-minute read covering the basics.",
              slug: "what-is-hpv",
            },
            {
              eyebrow: "Just got your results",
              title: "Understanding your screening results",
              body: "What each result category really means.",
              slug: "understanding-results",
            },
            {
              eyebrow: "Thinking about the vaccine",
              title: "The HPV vaccine: who, when, why",
              body: "Australia's program, eligibility, and the adult catch-up question.",
              slug: "hpv-vaccine",
            },
          ].map((c) => (
            <Link
              key={c.slug}
              href={`/learn/${c.slug}`}
              className="surface-card hoverable p-8 flex flex-col"
            >
              <p className="caption">{c.eyebrow}</p>
              <h3 className="h-article-3 mt-3">{c.title}</h3>
              <p className="caption mt-2">{c.body}</p>
              <span className="mt-6 text-[14px] inline-flex items-center gap-1 group">
                Read{" "}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured deep dive */}
      {featured && (
        <section className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="flex items-center gap-3 mb-8">
            <WillowSprig className="w-6 h-6" />
            <h2 className="display-sub">Step inside the appointment.</h2>
          </div>
          <Link
            href={`/learn/${featured.slug}`}
            className="surface-card hoverable block p-8 md:p-12"
          >
            <div className="grid gap-10 md:grid-cols-2 items-center">
              <div>
                <span
                  className="inline-block text-[12px] uppercase tracking-[0.5px] px-3 py-1 rounded-full"
                  style={{ background: "color-mix(in oklab, var(--color-rose) 18%, transparent)" }}
                >
                  Step-by-step walkthrough
                </span>
                <h3 className="h-article-2 mt-5">What to expect at your screening appointment</h3>
                <p className="body-md text-muted-foreground mt-3 max-w-md">
                  Six short steps, with the cervix-shaped clinic chair finally explained. For
                  first-time screeners and anyone who's been putting it off.
                </p>
                <span className="btn-primary mt-6">
                  Walk through it <ArrowRight className="w-4 h-4" />
                </span>
              </div>
              <div className="relative h-64 flex items-center justify-center">
                <div className="absolute inset-0 wash-sage opacity-90 rounded-full blur-2xl" />
                <WillowSprig className="relative w-48 h-48" />
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* All topics */}
      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="flex items-center gap-3 mb-12">
          <Ginkgo className="w-6 h-6" />
          <h2 className="display-sub">All topics.</h2>
        </div>

        <div className="space-y-14">
          {categories.map((cat) => {
            const items = articles.filter((a) => a.category === cat);
            return (
              <div key={cat}>
                <h3 className="text-[24px] font-semibold mb-6">{cat}</h3>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((a) => (
                    <Link
                      key={a.slug}
                      href={`/learn/${a.slug}`}
                      className="surface-card hoverable p-6 flex flex-col relative"
                    >
                      <Leaf className="absolute top-5 right-5 w-4 h-4 opacity-30" />
                      <p className="caption">{a.category}</p>
                      <h4 className="text-[20px] font-normal mt-2 leading-tight">{a.title}</h4>
                      <p className="caption mt-3 line-clamp-2">{a.excerpt}</p>
                      <div className="flex items-center justify-between mt-6">
                        <span className="text-[14px] inline-flex items-center gap-1">
                          Read <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                        {a.layout === "card-grid" && (
                          <span
                            className="text-[11px] uppercase tracking-[0.5px] px-2 py-0.5 rounded-full"
                            style={{
                              background: "color-mix(in oklab, var(--color-rose) 22%, transparent)",
                            }}
                          >
                            Card series
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Myths spotlight */}
      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <h2 className="display-sub mb-8">Common myths, plainly answered.</h2>
        <div className="flex gap-6 overflow-x-auto md:grid md:grid-cols-3 md:overflow-visible pb-2 -mx-6 px-6 md:mx-0 md:px-0">
          {[
            {
              n: "01",
              m: "If I have HPV, I'm going to get cancer.",
              r: "9 in 10 HPV infections clear on their own within 2 years.",
            },
            {
              n: "02",
              m: "The test is painful, I keep avoiding it.",
              r: "It is uncomfortable for most, painful for few. Self-collection is now an option.",
            },
            {
              n: "03",
              m: "Once you're through menopause, you can stop being screened.",
              r: "In Australia, eligibility runs to age 74.",
            },
          ].map((c) => (
            <div key={c.n} className="surface-card p-6 min-w-[280px] md:min-w-0">
              <div className="text-[24px] font-semibold">{c.n}</div>
              <p className="text-muted-foreground line-through text-[15px] mt-3 truncate">
                Myth: {c.m}
              </p>
              <p className="font-semibold mt-2 text-[15px]">Reality: {c.r}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/learn/myths-debunked" className="btn-ghost">
            See all 7 myths <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <AskAIBand />
      <FindClinicBand />
      <SiteFooter />
    </div>
  );
}
