import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/learn/site-footer";
import { StandardArticle } from "@/components/learn/standard-article";
import { ScrollytellingArticle } from "@/components/learn/scrollytelling-article";
import { CardGridArticle } from "@/components/learn/card-grid-article";
import { articles, getArticle, standardBodies } from "@/lib/learn/articles";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const a = getArticle(params.slug);
  if (!a) return { title: "Article not found - Cervix" };
  return {
    title: `${a.title} - Cervix`,
    description: a.excerpt,
    openGraph: {
      title: `${a.title} - Cervix`,
      description: a.excerpt,
    },
  };
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug);
  if (!article) notFound();

  return (
    <div className="min-h-screen">
      {article.layout === "standard" && (
        <StandardArticle article={article} body={standardBodies[params.slug] ?? []} />
      )}
      {article.layout === "scrollytelling" && <ScrollytellingArticle article={article} />}
      {article.layout === "card-grid" && <CardGridArticle article={article} />}
      <SiteFooter />
    </div>
  );
}
