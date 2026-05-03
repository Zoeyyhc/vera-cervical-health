import { LandingButton } from "@/components/landing/landing-button";
import { Dots, Leaf } from "@/components/landing/leaf";
import Link from "next/link";

const topics = [
  {
    category: "Screening",
    title: "What actually happens during a cervical screening test",
    excerpt: "A 5-minute walk-through of the appointment, from check-in to results.",
    href: "/learn/screening-appointment",
  },
  {
    category: "HPV",
    title: "HPV, explained without the panic",
    excerpt: "Why it's common, how it usually clears on its own, and when it doesn't.",
    href: "/learn/hpv",
  },
  {
    category: "Results",
    title: "Reading your results letter line by line",
    excerpt: "Decoding the language so you know what each phrase actually means.",
    href: "/learn/results",
  },
  {
    category: "Vaccines",
    title: "The HPV vaccine: who, when, and why",
    excerpt: "Eligibility, timing, and what the evidence says about protection.",
    href: "/learn/vaccines",
  },
  {
    category: "Anatomy basics",
    title: "A gentle map of the cervix and surrounding tissue",
    excerpt: "The vocabulary your doctor uses, drawn out in plain language.",
    href: "/learn/anatomy",
  },
  {
    category: "Talking to your doctor",
    title: "Questions to bring to your next appointment",
    excerpt: "A short list to make the visit feel less rushed and more useful.",
    href: "/learn/doctor-questions",
  },
];

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
