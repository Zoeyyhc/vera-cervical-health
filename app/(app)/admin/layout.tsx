import { requireAdmin } from "@/lib/auth/require-admin";

/** Gates every /admin/* route. Non-admins are redirected by requireAdmin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
