"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@sme/ui";
import { Plus, Trash2, Edit } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function RolesPage() {
  const { data: roles, refetch } = trpc.roles.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleSlug, setRoleSlug] = useState("");
  const [rolePerms, setRolePerms] = useState("");

  const createRole = trpc.roles.create.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setRoleName("");
      setRoleSlug("");
      setRolePerms("");
      refetch();
    },
  });

  const deleteRole = trpc.roles.delete.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles</h1>
          <p className="text-muted-foreground">
            Manage roles and permissions for your organization
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Custom Role</DialogTitle>
              <DialogDescription>
                Define a new role with specific permissions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g., Cashier"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-slug">Slug</Label>
                <Input
                  id="role-slug"
                  value={roleSlug}
                  onChange={(e) =>
                    setRoleSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    )
                  }
                  placeholder="e.g., cashier"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-perms">Permissions</Label>
                <Input
                  id="role-perms"
                  value={rolePerms}
                  onChange={(e) => setRolePerms(e.target.value)}
                  placeholder="core:dashboard:read, notes:*"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated. Format: module:resource:action
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const perms = rolePerms
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean);
                  createRole.mutate({
                    name: roleName,
                    slug: roleSlug,
                    permissions: perms,
                  });
                }}
                disabled={!roleName || !roleSlug || createRole.isPending}
              >
                {createRole.isPending ? "Creating..." : "Create Role"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {role.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={role.isSystem ? "default" : "secondary"}>
                      {role.isSystem ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(role.permissions ?? []).slice(0, 3).map((perm) => (
                        <Badge
                          key={perm}
                          variant="outline"
                          className="text-xs"
                        >
                          {perm}
                        </Badge>
                      ))}
                      {(role.permissions ?? []).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{(role.permissions ?? []).length - 3} more
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!role.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteRole.mutate({ id: role.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
