const sources = ["Cancer Council Australia", "World Health Organization", "HealthDirect"];

export function TrustStrip() {
  return (
    <section className="border-y border-border py-16">
      <div className="container-cervix text-center">
        <p className="caption text-muted-gray">Grounded in</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {sources.map((n) => (
            <span key={n} className="text-[20px]">
              {n}
            </span>
          ))}
        </div>
        <p className="body-base mx-auto mt-6 max-w-[640px] text-muted-gray">
          Every answer the assistant gives is traceable to a cited source. Cervix is not a
          diagnostic tool — always consult a healthcare professional.
        </p>
      </div>
    </section>
  );
}
