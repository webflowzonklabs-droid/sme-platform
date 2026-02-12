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
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@sme/ui";
import { Building2, Users, Package, Activity, Plus, Loader2 } from "lucide-react";
import { trpc } from "@/trpc/client";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminPage() {
  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery();
  const { data: allTenants, refetch: refetchTenants, isLoading: tenantsLoading } =
    trpc.admin.listTenants.useQuery();

  const setTenantActive = trpc.admin.setTenantActive.useMutation({
    onSuccess: () => refetchTenants(),
  });

  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

  // Create tenant dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [createError, setCreateError] = useState("");

  const createTenant = trpc.tenants.create.useMutation({
    onSuccess: () => {
      setCreateDialogOpen(false);
      setNewTenantName("");
      setNewTenantSlug("");
      setSlugEdited(false);
      setCreateError("");
      refetchTenants();
    },
    onError: (err) => setCreateError(err.message),
  });

  const handleNameChange = (value: string) => {
    setNewTenantName(value);
    if (!slugEdited) {
      setNewTenantSlug(slugify(value));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Platform Overview</h2>
          <p className="text-muted-foreground">
            Manage tenants, modules, and platform settings
          </p>
        </div>
        <Button onClick={() => { setCreateError(""); setCreateDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          New Tenant
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Tenants", value: stats?.totalTenants ?? 0, icon: Building2 },
          { label: "Active Tenants", value: stats?.activeTenants ?? 0, icon: Activity },
          { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users },
          { label: "Available Modules", value: stats?.availableModules ?? 0, icon: Package },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
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
          {tenantsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading tenants...</span>
            </div>
          ) : (
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
                          {selectedTenant === tenant.id ? "Hide" : "Modules"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!allTenants || allTenants.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No tenants found. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
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

      {/* Create Tenant Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>
              Create a new organization on the platform. You will be assigned as the owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {createError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {createError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Organization Name</Label>
              <Input
                id="tenant-name"
                value={newTenantName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Business"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/</span>
                <Input
                  id="tenant-slug"
                  value={newTenantSlug}
                  onChange={(e) => {
                    setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    setSlugEdited(true);
                  }}
                  placeholder="my-business"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCreateError("");
                createTenant.mutate({
                  name: newTenantName,
                  slug: newTenantSlug || slugify(newTenantName),
                });
              }}
              disabled={!newTenantName || createTenant.isPending}
            >
              {createTenant.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Tenant"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          {(!available || available.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No modules available
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
