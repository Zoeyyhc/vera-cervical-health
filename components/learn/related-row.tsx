import { getRelated } from "@/lib/learn/articles";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Leaf } from "./botanical";

export function RelatedRow({ slug }: { slug: string }) {
  const related = getRelated(slug);
  return (
    <section className="mt-20">
      <h2 className="h-article-3 mb-6">Keep reading.</h2>
      <div className="grid gap-6 md:grid-cols-3">
        {related.map((a) => (
          <Link
            key={a.slug}
            href={`/learn/${a.slug}`}
            className="surface-card hoverable p-6 relative"
          >
            <Leaf className="absolute top-5 right-5 w-4 h-4 opacity-30" />
            <p className="caption">{a.category}</p>
            <h3 className="text-[18px] mt-2 font-normal leading-snug">{a.title}</h3>
            <p className="caption mt-3 line-clamp-2">{a.excerpt}</p>
            <span className="text-[14px] mt-4 inline-flex items-center gap-1">
              Read <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
