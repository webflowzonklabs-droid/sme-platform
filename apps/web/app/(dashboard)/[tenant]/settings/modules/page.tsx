"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
} from "@sme/ui";
import { Package } from "lucide-react";
import { trpc } from "@/trpc/client";

/**
 * Modules page — read-only view of enabled modules.
 * Module enable/disable is now a platform admin operation only.
 * Tenants can view what modules they have access to, but cannot toggle them.
 */
export default function ModulesPage() {
  const { data: enabled } = trpc.modules.enabled.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Modules</h1>
        <p className="text-muted-foreground">
          Modules enabled for your organization. Contact the platform
          administrator to enable or disable modules.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {enabled?.map((mod) => (
          <Card key={mod.moduleId}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{mod.name}</CardTitle>
                <CardDescription className="mt-1">
                  Version {mod.version}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Badge variant="default" className="text-xs">
                Enabled
              </Badge>
            </CardContent>
          </Card>
        ))}
        {(!enabled || enabled.length === 0) && (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              No modules are currently enabled for your organization.
              Contact your platform administrator.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
