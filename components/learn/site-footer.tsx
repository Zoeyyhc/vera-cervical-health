import Link from "next/link";
import { Eucalyptus } from "./botanical";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto max-w-[1200px] px-6 py-16 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <Eucalyptus className="w-5 h-5" />
            <span className="text-[18px] font-semibold">Cervix</span>
          </div>
          <p className="caption mt-4 max-w-sm">
            Plain-language cervical health education. Cited sources, never a diagnosis.
          </p>
        </div>
        <div>
          <p className="text-[14px] font-semibold mb-3">Product</p>
          <ul className="space-y-2 caption">
            <li>
              <Link href="/learn">Learn</Link>
            </li>
            <li>
              <Link href="/chat">Assistant</Link>
            </li>
            <li>
              <Link href="/clinics">Find a clinic</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-[1200px] px-6 py-6 caption flex flex-wrap justify-between gap-4">
          <span>© 2026 Cervix. General education, not medical advice.</span>
          <span>Made with care.</span>
        </div>
      </div>
    </footer>
  );
}
