import { AskAnything } from "@/components/landing/ask-anything";
import { FeaturedTopics } from "@/components/landing/featured-topics";
import { FindClinic } from "@/components/landing/find-clinic";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Nav } from "@/components/landing/nav";
import { SignupBand } from "@/components/landing/signup-band";
import { StartHere } from "@/components/landing/start-here";
import { TrustStrip } from "@/components/landing/trust-strip";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <StartHere />
      <HowItWorks />
      <TrustStrip />
      <FeaturedTopics />
      <AskAnything />
      <FindClinic />
      <SignupBand />
      <Footer />
    </main>
  );
}
