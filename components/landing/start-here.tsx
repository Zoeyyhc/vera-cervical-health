import { Leaf } from "@/components/landing/leaf";
import Link from "next/link";

const items = [
  {
    title: "Understanding HPV",
    body: "What it is, how common it is, and what it means for you — without the panic.",
    href: "/learn/hpv",
  },
  {
    title: "What is cervical screening?",
    body: "A plain-language walk-through of the test, the timeline, and what to expect.",
    href: "/learn/screening",
  },
  {
    title: "After an abnormal result",
    body: "What follow-up looks like, what your options are, and questions to ask.",
    href: "/learn/abnormal-result",
  },
];

export function StartHere() {
  return (
    <section className="section-pad">
      <div className="container-cervix">
        <div className="flex items-center gap-3">
          <Leaf className="text-foreground" />
          <h2 className="heading-sub">Start here.</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <article key={it.href} className="rounded-card border border-border bg-card p-8">
              <h3 className="text-[20px] font-semibold leading-snug">{it.title}</h3>
              <p className="body-base mt-3 text-muted-gray">{it.body}</p>
              <Link
                href={it.href}
                className="mt-6 inline-block text-base underline underline-offset-4"
              >
                Read →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
