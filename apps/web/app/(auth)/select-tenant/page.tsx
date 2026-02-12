"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from "@sme/ui";
import { Building2, Plus, Shield } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function SelectTenantPage() {
  const router = useRouter();
  const { data: tenants, isLoading } = trpc.auth.myTenants.useQuery();
  const { data: me } = trpc.auth.me.useQuery();
  const autoSwitchDone = useRef(false);
  const switchTenant = trpc.auth.switchTenant.useMutation({
    onSuccess: (data) => {
      // Find the tenant slug
      const tenant = tenants?.find((t) => t.tenantId === data.tenantId);
      if (tenant) {
        // Force a page reload to pick up the new session context
        window.location.href = `/${tenant.tenantSlug}`;
      }
    },
  });

  // Auto-switch to sole tenant, but NOT for super admins who need
  // to see the Platform Admin card and Create Tenant button
  useEffect(() => {
    if (tenants?.length === 1 && !autoSwitchDone.current && !me?.user?.isSuperAdmin) {
      autoSwitchDone.current = true;
      switchTenant.mutate({ tenantId: tenants[0]!.tenantId });
    }
  }, [tenants, me]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading your organizations...
        </CardContent>
      </Card>
    );
  }

  if (!tenants || tenants.length === 0) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle>No Organizations Yet</CardTitle>
          <CardDescription>
            Create your first organization to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Button onClick={() => router.push("/create-tenant")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </CardContent>
      </Card>
    );
  }

  // If only one tenant and not super admin, show redirecting message
  if (tenants.length === 1 && !me?.user?.isSuperAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Redirecting to {tenants[0]!.tenantName}...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Select Organization</CardTitle>
        <CardDescription>
          Choose which organization you want to access
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {me?.user?.isSuperAdmin && (
          <button
            onClick={() => router.push("/admin")}
            className="w-full flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left mb-2"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Platform Admin</div>
              <div className="text-sm text-muted-foreground">
                Manage tenants, modules & users
              </div>
            </div>
            <Badge variant="default">Admin</Badge>
          </button>
        )}
        {tenants.map((tenant) => (
          <button
            key={tenant.tenantId}
            onClick={() => switchTenant.mutate({ tenantId: tenant.tenantId })}
            disabled={switchTenant.isPending}
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-medium">{tenant.tenantName}</div>
              <div className="text-sm text-muted-foreground">
                /{tenant.tenantSlug}
              </div>
            </div>
            <Badge variant="secondary">{tenant.roleName}</Badge>
          </button>
        ))}
        <div className="pt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/create-tenant")}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Organization
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
