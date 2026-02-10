import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/shell";
import { getTenantSlugById } from "@sme/core";

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

  // SECURITY FIX: Validate tenant slug matches the session's tenant (M4)
  // Prevents URL confusion where slug says one thing but data is from another tenant.
  const sessionTenantSlug = await getTenantSlugById(session.session.tenantId);

  if (!sessionTenantSlug || sessionTenantSlug !== tenantSlug) {
    // Redirect to the correct URL for the session's tenant
    if (sessionTenantSlug) {
      redirect(`/${sessionTenantSlug}`);
    }
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
