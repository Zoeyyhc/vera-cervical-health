import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Learn", href: "/learn" },
      { label: "Assistant", href: "/chat" },
      { label: "Find a clinic", href: "/clinics" },
    ],
  },
  {
    heading: "About",
    links: [
      { label: "Our sources", href: "/about/sources" },
      { label: "How we built this", href: "/about/build" },
      { label: "Contact", href: "/about/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "Medical disclaimer", href: "/legal/medical-disclaimer" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="container-cervix pb-12">
      <div className="rounded-container border-t border-border pt-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <p className="text-[18px] font-semibold">Vera</p>
            <p className="caption mt-3 text-muted-gray">
              Cervical health education, grounded in trusted sources.
            </p>
          </div>
          {columns.map((c) => (
            <div key={c.heading}>
              <p className="caption text-muted-gray">{c.heading}</p>
              <ul className="mt-3 space-y-2">
                {c.links.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="body-base hover:underline underline-offset-4">
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row">
          <p className="caption text-muted-gray">© 2026 Vera</p>
          <p className="caption text-muted-gray">
            <span className="underline underline-offset-4">EN</span>
            {" | "}
            <Link href="/?lang=zh" className="hover:underline underline-offset-4">
              中文
            </Link>
          </p>
        </div>
        <p className="caption mt-6 text-center text-muted-gray">
          Vera is an educational tool. It is not a substitute for medical advice, diagnosis, or
          treatment.
        </p>
      </div>
    </footer>
  );
}
