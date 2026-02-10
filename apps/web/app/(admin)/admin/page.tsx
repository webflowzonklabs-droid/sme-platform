"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sme/ui";
import { Building2, Users, Package, Activity } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function AdminPage() {
  const { data: stats } = trpc.admin.stats.useQuery();
  const { data: allTenants, refetch: refetchTenants } =
    trpc.admin.listTenants.useQuery();

  const setTenantActive = trpc.admin.setTenantActive.useMutation({
    onSuccess: () => refetchTenants(),
  });

  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Platform Overview</h2>
        <p className="text-muted-foreground">
          Manage tenants, modules, and platform settings
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTenants ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeTenants ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Modules</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.availableModules ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tenants List */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
          <CardDescription>
            Manage tenant status and module access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTenants?.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    /{tenant.slug}
                  </TableCell>
                  <TableCell>{tenant.memberCount}</TableCell>
                  <TableCell>{tenant.moduleCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={tenant.isActive ? "default" : "secondary"}
                    >
                      {tenant.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tenant.isActive}
                        onCheckedChange={(checked) =>
                          setTenantActive.mutate({
                            tenantId: tenant.id,
                            isActive: checked,
                          })
                        }
                        disabled={setTenantActive.isPending}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedTenant(
                            selectedTenant === tenant.id ? null : tenant.id
                          )
                        }
                      >
                        Modules
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!allTenants || allTenants.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No tenants found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Module Management Panel */}
      {selectedTenant && (
        <TenantModulePanel
          tenantId={selectedTenant}
          tenantName={
            allTenants?.find((t) => t.id === selectedTenant)?.name ?? ""
          }
        />
      )}
    </div>
  );
}

function TenantModulePanel({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const { data: available } = trpc.modules.available.useQuery();
  const { data: enabledModules, refetch: refetchModules } =
    trpc.admin.getTenantModules.useQuery({ tenantId });

  const enableModule = trpc.admin.enableModule.useMutation({
    onSuccess: () => refetchModules(),
  });
  const disableModule = trpc.admin.disableModule.useMutation({
    onSuccess: () => refetchModules(),
  });

  const enabledIds = new Set(enabledModules?.map((m) => m.moduleId) ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modules for {tenantName}</CardTitle>
        <CardDescription>
          Enable or disable modules for this tenant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {available?.map((mod) => {
            const isEnabled = enabledIds.has(mod.id);
            const isPending =
              enableModule.isPending || disableModule.isPending;

            return (
              <div
                key={mod.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium">{mod.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {mod.description ?? "No description"} · v{mod.version}
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  disabled={isPending}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      enableModule.mutate({ tenantId, moduleId: mod.id });
                    } else {
                      disableModule.mutate({ tenantId, moduleId: mod.id });
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
