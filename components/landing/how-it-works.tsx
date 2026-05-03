import { Sprig } from "@/components/landing/leaf";

const steps = [
  { n: "01", t: "Read", b: "Browse plain-language explainers, written from trusted sources." },
  { n: "02", t: "Ask", b: "Talk to an AI assistant grounded in citations, not guesses." },
  { n: "03", t: "Find", b: "Locate a screening clinic near you, when you're ready." },
];

function Icon({ i }: { i: number }) {
  if (i === 0)
    return (
      <svg
        width={28}
        height={28}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 5c4 0 6 1 8 3 2-2 4-3 8-3v14c-4 0-6 1-8 3-2-2-4-3-8-3V5z" />
      </svg>
    );
  if (i === 1)
    return (
      <svg
        width={28}
        height={28}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6h16v10H8l-4 4V6z" />
      </svg>
    );
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section className="section-pad">
      <div className="container-cervix">
        <div className="flex items-center gap-3">
          <Sprig className="text-foreground" />
          <h2 className="heading-sub">How Cervix works.</h2>
        </div>
        <div className="mt-12 grid gap-12 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.n}>
              <Icon i={i} />
              <p className="caption mt-6 text-muted-gray">{s.n}</p>
              <h3 className="mt-1 text-[20px]">{s.t}</h3>
              <p className="body-base mt-2 text-muted-gray">{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
