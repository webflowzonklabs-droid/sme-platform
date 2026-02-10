"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Switch,
} from "@sme/ui";
import { Package } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function ModulesPage() {
  const { data: available } = trpc.modules.available.useQuery();
  const { data: enabled, refetch: refetchEnabled } =
    trpc.modules.enabled.useQuery();

  const enableModule = trpc.modules.enable.useMutation({
    onSuccess: () => refetchEnabled(),
  });
  const disableModule = trpc.modules.disable.useMutation({
    onSuccess: () => refetchEnabled(),
  });

  const enabledIds = new Set(enabled?.map((m) => m.moduleId) ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Modules</h1>
        <p className="text-muted-foreground">
          Enable or disable modules for your organization
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {available?.map((mod) => {
          const isEnabled = enabledIds.has(mod.id);
          const isPending =
            enableModule.isPending || disableModule.isPending;

          return (
            <Card key={mod.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{mod.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {mod.description ?? "No description"}
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  disabled={isPending}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      enableModule.mutate({ moduleId: mod.id });
                    } else {
                      disableModule.mutate({ moduleId: mod.id });
                    }
                  }}
                />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    v{mod.version}
                  </Badge>
                  {mod.dependencies.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      Requires: {mod.dependencies.join(", ")}
                    </Badge>
                  )}
                  <Badge
                    variant={isEnabled ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!available || available.length === 0) && (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              No modules available
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
