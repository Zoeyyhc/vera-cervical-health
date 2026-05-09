import { LandingButton } from "@/components/landing/landing-button";
import { Dots, Leaf } from "@/components/landing/leaf";
import { articles } from "@/lib/learn/articles";
import Link from "next/link";

// Pull straight from /learn so titles, excerpts, categories, and slugs stay in sync.
const topics = articles.slice(0, 6).map((a) => ({
  category: a.category,
  title: a.title,
  excerpt: a.excerpt,
  href: `/learn/${a.slug}`,
}));

export function FeaturedTopics() {
  return (
    <section className="section-pad">
      <div className="container-cervix">
        <div className="flex items-center gap-3">
          <Dots className="text-foreground" />
          <h2 className="heading-sub">Read at your own pace.</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <article key={t.href} className="rounded-card border border-border bg-card p-6">
              <Leaf size={20} className="text-foreground/70" />
              <p className="caption mt-4 text-muted-gray">{t.category}</p>
              <h3 className="mt-2 text-[20px] leading-snug">{t.title}</h3>
              <p className="caption mt-3 text-muted-gray">{t.excerpt}</p>
              <Link
                href={t.href}
                className="caption mt-4 inline-block underline underline-offset-4"
              >
                Read →
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-12 flex justify-center">
          <Link href="/learn">
            <LandingButton variant="ghost">See all topics</LandingButton>
          </Link>
        </div>
      </div>
    </section>
  );
}
