import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.user.isSuperAdmin) {
    redirect("/select-tenant");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Platform Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/select-tenant"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Switch to Tenant View
            </Link>
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
