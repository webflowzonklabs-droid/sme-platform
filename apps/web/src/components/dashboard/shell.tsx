"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Button,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
} from "@sme/ui";
import { cn } from "@sme/ui";
import {
  LayoutDashboard,
  Settings,
  Settings2,
  Users,
  Shield,
  Package,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building2,
  StickyNote,
  FolderTree,
  ChefHat,
  BarChart3,
} from "lucide-react";
import { trpc } from "@/trpc/client";
import { clearSessionCookie } from "@/lib/auth";

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    isSuperAdmin: boolean;
  };
  membership: {
    id: string;
    roleId: string;
    roleName: string;
    roleSlug: string;
    permissions: string[];
  };
  tenantSlug: string;
}

const coreNavItems = [
  {
    label: "Dashboard",
    href: "",
    icon: LayoutDashboard,
  },
];

const settingsNavItems = [
  {
    label: "General",
    href: "/settings",
    icon: Settings,
    permission: "core:settings:manage",
  },
  {
    label: "Members",
    href: "/settings/members",
    icon: Users,
    permission: "core:users:read",
  },
  {
    label: "Roles",
    href: "/settings/roles",
    icon: Shield,
    permission: "core:users:read",
  },
  {
    label: "Modules",
    href: "/settings/modules",
    icon: Package,
    permission: "core:settings:manage",
  },
];

function hasPermission(userPerms: string[], required: string): boolean {
  if (userPerms.includes("*")) return true;
  if (userPerms.includes(required)) return true;
  const parts = required.split(":");
  if (parts.length >= 2 && userPerms.includes(`${parts[0]}:*`)) return true;
  if (parts.length === 3 && userPerms.includes(`${parts[0]}:${parts[1]}:*`))
    return true;
  return false;
}

export function DashboardShell({
  children,
  user,
  membership,
  tenantSlug,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: enabledModules } = trpc.modules.enabled.useQuery();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await clearSessionCookie();
      window.location.href = "/login";
    },
  });

  const basePath = `/${tenantSlug}`;
  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Build module nav items from enabled modules
  const moduleNavItems = (enabledModules ?? []).flatMap((mod) =>
    mod.navigation
      .filter((nav) => hasPermission(membership.permissions, nav.permission))
      .map((nav) => ({
        label: nav.label,
        href: nav.href,
        icon: getIcon(nav.icon),
      }))
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo / Tenant */}
          <div className="flex items-center gap-2 px-4 h-16 border-b">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg truncate">SME Platform</span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {/* Core nav */}
            {coreNavItems.map((item) => {
              const href = `${basePath}${item.href}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* Module nav items */}
            {moduleNavItems.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Modules
                </p>
                {moduleNavItems.map((item) => {
                  const href = `${basePath}${item.href}`;
                  const isActive = pathname.startsWith(href);
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}

            {/* Settings section */}
            <Separator className="my-3" />
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Settings
            </p>
            {settingsNavItems
              .filter(
                (item) =>
                  !item.permission ||
                  hasPermission(membership.permissions, item.permission)
              )
              .map((item) => {
                const href = `${basePath}${item.href}`;
                const isActive = pathname === href;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          {/* User section */}
          <div className="border-t p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-muted transition-colors">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium truncate">
                      {user.fullName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {membership.roleName}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.isSuperAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      Platform Admin
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/select-tenant">
                    <Building2 className="mr-2 h-4 w-4" />
                    Switch Organization
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutMutation.mutate()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="font-semibold">SME Platform</div>
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

/** Map icon name strings to Lucide icons */
function getIcon(name: string) {
  const icons: Record<string, typeof LayoutDashboard> = {
    LayoutDashboard,
    Settings,
    Settings2,
    Users,
    Shield,
    Package,
    StickyNote,
    FolderTree,
    ChefHat,
    BarChart3,
  };
  return icons[name] ?? Package;
}
