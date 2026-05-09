import type { Article } from "@/lib/learn/articles";
import Link from "next/link";
import { Leaf } from "./botanical";

export function ArticleHeader({ article }: { article: Article }) {
  return (
    <header className="pt-16 pb-8">
      <div className="flex items-center gap-2 caption">
        <Leaf className="w-3.5 h-3.5" />
        <Link href="/learn" className="hover:text-foreground">
          {article.category}
        </Link>
      </div>
      <h1 className="display-section mt-5 max-w-[720px]">{article.title}</h1>
      <p className="caption mt-6">
        For: {article.reader} <span className="mx-2">·</span> ~{article.readMinutes} min read{" "}
        <span className="mx-2">·</span> Last updated {article.updated}
      </p>
      <div className="border-t border-border mt-8" />
    </header>
  );
}
