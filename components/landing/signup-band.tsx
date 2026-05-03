import { LandingButton } from "@/components/landing/landing-button";
import { Sprig } from "@/components/landing/leaf";
import Link from "next/link";

export function SignupBand() {
  return (
    <section className="section-pad">
      <div className="container-cervix flex flex-col items-center text-center">
        <Sprig size={36} className="text-foreground/80" />
        <h2 className="heading-sub mt-6">Save what you read, in one place.</h2>
        <p className="body-large mt-6 max-w-[560px] text-muted-gray">
          Create a free account to bookmark articles, keep your conversation history, and pick up
          where you left off.
        </p>
        <div className="mt-10">
          <Link href="/register">
            <LandingButton>Create your account</LandingButton>
          </Link>
        </div>
        <Link href="/chat" className="caption mt-4 text-muted-gray underline underline-offset-4">
          or continue without an account →
        </Link>
      </div>
    </section>
  );
}
