import { AppNav } from "@/components/app/app-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      {/* flex flex-col makes <main> a flex container so chat's nested flex-1 chain
          (sidebar/messages/input) gets a definite height to grow into. Routes that
          rely on natural sizing (clinics/profile use min-h-screen) still work as
          flex items - flex-grow defaults to 0, so they take their own height. */}
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
