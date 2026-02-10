import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.session.tenantId) {
    redirect("/select-tenant");
  }

  // Get tenant slug for redirect
  // For now, redirect to select-tenant which will handle the routing
  redirect("/select-tenant");
}
