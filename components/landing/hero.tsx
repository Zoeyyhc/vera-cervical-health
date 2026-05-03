import { LandingButton } from "@/components/landing/landing-button";
import Image from "next/image";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden section-pad">
      <Image
        src="/landing/watercolor-wash.png"
        alt=""
        aria-hidden="true"
        width={1600}
        height={1200}
        priority
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 w-[120%] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-30"
      />
      <div className="container-cervix relative">
        <p className="caption text-center text-muted-gray">Cervical health education</p>
        <h1 className="display-hero mx-auto mt-6 max-w-[880px] text-center">
          Cervical health, in language you can hold onto.
        </h1>
        <p className="body-large mx-auto mt-6 max-w-[640px] text-center text-muted-gray">
          A quiet place to learn what screening is, what HPV means, and what your results actually
          say — grounded in trusted sources, never a diagnosis.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/learn">
            <LandingButton>Start with the basics</LandingButton>
          </Link>
          <Link href="/chat">
            <LandingButton variant="ghost">Ask a question →</LandingButton>
          </Link>
        </div>
        <Image
          src="/landing/eucalyptus.png"
          alt=""
          aria-hidden="true"
          width={768}
          height={1024}
          className="pointer-events-none absolute -right-8 top-4 hidden h-[320px] w-auto opacity-70 lg:block"
        />
      </div>
    </section>
  );
}
