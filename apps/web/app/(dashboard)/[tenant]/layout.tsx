import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const session = await getSession();
  const { tenant: tenantSlug } = await params;

  if (!session) {
    redirect("/login");
  }

  if (!session.session.tenantId || !session.membership) {
    redirect("/select-tenant");
  }

  return (
    <DashboardShell
      user={session.user}
      membership={session.membership}
      tenantSlug={tenantSlug}
    >
      {children}
    </DashboardShell>
  );
}
