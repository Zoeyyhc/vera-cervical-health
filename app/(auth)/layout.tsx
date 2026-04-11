// app/(auth)/layout.tsx
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[360px]">{children}</div>
    </div>
  );
}
