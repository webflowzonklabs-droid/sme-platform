"use client";

import { useState, useEffect } from "react";
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

  // FIX: Use useEffect instead of render-time state update (H9)
  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
    }
  }, [tenant?.name]);

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
              // SECURITY FIX: Don't pass tenant ID — server uses session's tenant ID
              updateTenant.mutate({ name });
            }}
            disabled={saving || !tenant}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
