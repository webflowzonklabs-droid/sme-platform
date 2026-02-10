"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sme/ui";
import {
  Users,
  Shield,
  Package,
  Activity,
} from "lucide-react";
import { trpc } from "@/trpc/client";

export default function DashboardPage() {
  const { data: tenant } = trpc.tenants.current.useQuery();
  const { data: enabledModules } = trpc.modules.enabled.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {tenant?.name ?? "your organization"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organization</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant?.name ?? "—"}</div>
            <p className="text-xs text-muted-foreground">
              /{tenant?.slug}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Modules
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {enabledModules?.length ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              modules enabled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Active</div>
            <p className="text-xs text-muted-foreground">
              platform is operational
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Region</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(tenant?.settings as Record<string, string> | undefined)?.timezone ?? "UTC"}
            </div>
            <p className="text-xs text-muted-foreground">timezone</p>
          </CardContent>
        </Card>
      </div>

      {enabledModules && enabledModules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Enabled Modules</CardTitle>
            <CardDescription>
              Modules currently active for your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {enabledModules.map((mod) => (
                <div
                  key={mod.moduleId}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{mod.name}</div>
                    <div className="text-xs text-muted-foreground">
                      v{mod.version}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
