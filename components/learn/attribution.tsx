import { sourcesList } from "@/lib/learn/articles";

export function Attribution() {
  return (
    <section className="mt-16">
      <h2 className="h-article-3">Sources.</h2>
      <ul className="mt-4 space-y-3 caption">
        {sourcesList.map((s) => (
          <li key={s.url} className="leading-relaxed">
            <em>{s.title}</em> - {s.license}
            <br />
            <a href={s.url} className="underline truncate block max-w-full" title={s.url}>
              {s.url}
            </a>
          </li>
        ))}
      </ul>
      <p className="caption text-center mt-12 max-w-xl mx-auto">
        This article is general education, not medical advice. Please speak with your GP about any
        personal concerns.
      </p>
    </section>
  );
}
