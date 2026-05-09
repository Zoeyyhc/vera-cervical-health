import { ArrowRight } from "lucide-react";

export function RightRail({ title }: { title: string }) {
  const q = encodeURIComponent(title);
  return (
    <aside className="hidden lg:block sticky top-24 self-start space-y-3">
      <a href={`/chat?q=${q}`} className="btn-pill">
        <span>Ask the AI about this</span>
        <ArrowRight className="w-4 h-4" />
      </a>
      <a href="/clinics" className="btn-pill">
        <span>Find a clinic</span>
        <ArrowRight className="w-4 h-4" />
      </a>
    </aside>
  );
}

export function MobileCTABar({ title }: { title: string }) {
  const q = encodeURIComponent(title);
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border p-3 flex gap-2">
      <a href={`/chat?q=${q}`} className="btn-pill flex-1 text-[14px]">
        <span>Ask the AI</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </a>
      <a href="/clinics" className="btn-pill flex-1 text-[14px]">
        <span>Find a clinic</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
