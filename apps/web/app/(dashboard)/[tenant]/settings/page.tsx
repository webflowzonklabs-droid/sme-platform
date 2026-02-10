"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
} from "@sme/ui";
import { trpc } from "@/trpc/client";

export default function SettingsPage() {
  const { data: tenant, refetch } = trpc.tenants.current.useQuery();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const updateTenant = trpc.tenants.update.useMutation({
    onSuccess: () => {
      refetch();
      setSaving(false);
    },
    onError: () => setSaving(false),
  });

  // Initialize form when data loads
  if (tenant && !name) {
    setName(tenant.name);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={tenant?.slug ?? ""} disabled />
            <p className="text-xs text-muted-foreground">
              URL slug cannot be changed after creation
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => {
              if (!tenant) return;
              setSaving(true);
              updateTenant.mutate({ id: tenant.id, name });
            }}
            disabled={saving || !tenant}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
            <div>
              <div className="font-medium">Deactivate Organization</div>
              <div className="text-sm text-muted-foreground">
                This will disable access for all members
              </div>
            </div>
            <Button variant="destructive" size="sm" disabled>
              Deactivate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
