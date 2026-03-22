import { Link, useLocation } from "wouter";
import { useSearchParams } from "wouter";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  LayoutDashboard,
  MessageCircle,
  Settings,
  LogOut,
  ChevronDown,
  TrendingUp,
  Receipt,
  Repeat,
  Zap,
  GitCompareArrows,
  FileSpreadsheet,
  FileText,
  Users,
} from "lucide-react";
import type { Tenant } from "@shared/schema";
import { FINJOE_PATHS, finjoePathWithTenant } from "@/lib/finjoe-routes";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const [location] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, isTenantAdmin } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isSuperAdmin,
  });

  const setTenant = (id: string | null) => {
    if (!id) {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.delete("tenantId");
        return next.toString() ? `?${next}` : "";
      });
    } else {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set("tenantId", id);
        return `?${next}`;
      });
    }
  };

  const finjoeHref =
    isSuperAdmin && urlTenantId
      ? `/admin/finjoe?tenantId=${encodeURIComponent(urlTenantId)}`
      : "/admin/finjoe";

  /** Deep-link to dashboard users (scalable path; same destination as legacy `/admin/team`). */
  const teamHref = finjoePathWithTenant(FINJOE_PATHS.peopleUsers, tenantId, isSuperAdmin);

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/reports", label: "Reports", icon: FileSpreadsheet },
    ...(isSuperAdmin
      ? [
          { href: "/admin/tenants", label: "Tenants", icon: Building2 },
        ]
      : []),
    ...(isTenantAdmin ? [{ href: teamHref, label: "Team", icon: Users }] : []),
    { href: finjoeHref, label: "FinJoe", icon: MessageCircle },
    { href: "/admin/expenses", label: "Expenses", icon: Receipt },
    { href: "/admin/recurring-templates", label: "Recurring Expenses", icon: Repeat },
    { href: "/admin/income", label: "Income", icon: TrendingUp },
    { href: "/admin/recurring-income-templates", label: "Recurring Income", icon: Repeat },
    { href: "/admin/invoicing", label: "Invoicing", icon: FileText },
    { href: "/admin/reconciliation", label: "Reconciliation", icon: GitCompareArrows },
    ...(isSuperAdmin
      ? [
          { href: "/admin/cron", label: "Cron Jobs", icon: Zap },
          { href: "/admin/account-settings", label: "Account Settings", icon: Settings },
        ]
      : []),
  ];

  return (
    <SidebarProvider>
      <Sidebar side="left" collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex h-14 items-center gap-2 px-2">
            <SidebarTrigger className="md:hidden" />
            <Link href="/admin/dashboard" className="font-display text-lg font-semibold text-foreground hover:text-primary transition-colors">
              FinJoe
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const locPath = location.split("?")[0];
                  const itemPath = item.href.split("?")[0];
                  const isActive =
                    itemPath === "/admin/finjoe"
                      ? locPath.startsWith("/admin/finjoe")
                      : itemPath === FINJOE_PATHS.peopleUsers
                        ? locPath.startsWith("/admin/finjoe/people/users")
                        : locPath === itemPath;
                  return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {isSuperAdmin && tenants.length > 0 && (
            <>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupContent>
                  <div className="px-2 py-1">
                    <Select value={tenantId || ""} onValueChange={(v) => setTenant(v || null)}>
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue placeholder="Select tenant" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="flex flex-col gap-2 p-2">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 justify-between gap-2 px-2 w-full">
                    <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
          <SidebarTrigger className="md:hidden" />
        </header>
        <div className="flex-1 p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
