import { Link, useLocation } from "wouter";
import { useSearchParams } from "wouter";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  BookOpen,
  LayoutDashboard,
  LayoutGrid,
  MessageCircle,
  Settings,
  LogOut,
  ChevronDown,
  TrendingUp,
  Receipt,
  Repeat,
  Zap,
  GitCompareArrows,
  Upload,
  FileSpreadsheet,
  FileText,
  Users,
  UserCog,
} from "lucide-react";
import type { Tenant } from "@shared/schema";
import { FINJOE_PATHS, finjoePathWithTenant } from "@/lib/finjoe-routes";
import logoImage from "@assets/finjoe-logo.png";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const [location] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout, isTenantAdmin } = useAuth();
  const { toast } = useToast();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [wantsSalesHelp, setWantsSalesHelp] = useState(false);

  const switchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/switch-to-real-data", { wantsSalesHelp });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Switch failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSwitchOpen(false);
      toast({
        title: "Switched to your workspace",
        description: "You're now on your organization's empty account — configure it when you're ready.",
      });
      window.location.reload();
    },
    onError: (e: Error) => {
      toast({ title: "Could not switch", description: e.message, variant: "destructive" });
    },
  });
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

  const dataHandlingHref =
    isSuperAdmin && urlTenantId
      ? `/admin/data-handling?tenantId=${encodeURIComponent(urlTenantId)}`
      : "/admin/data-handling";

  /** Deep-link to dashboard users (scalable path; same destination as legacy `/admin/team`). */
  const teamHref = finjoePathWithTenant(FINJOE_PATHS.peopleUsers, tenantId, isSuperAdmin);

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/help", label: "Help", icon: BookOpen },
    { href: "/admin/reports", label: "Reports", icon: FileSpreadsheet },
    ...(isTenantAdmin ? [{ href: teamHref, label: "Team", icon: Users }] : []),
    { href: finjoeHref, label: "FinJoe", icon: MessageCircle },
    { href: "/admin/expenses", label: "Expenses", icon: Receipt },
    { href: "/admin/recurring-templates", label: "Recurring Expenses", icon: Repeat },
    { href: "/admin/income", label: "Income", icon: TrendingUp },
    { href: "/admin/recurring-income-templates", label: "Recurring Income", icon: Repeat },
    { href: "/admin/invoicing", label: "Invoicing", icon: FileText },
    { href: "/admin/reconciliation", label: "Reconciliation", icon: GitCompareArrows },
    { href: dataHandlingHref, label: "Data Handling", icon: Upload },
  ];

  const platformNavItems = isSuperAdmin
    ? [
        { href: "/admin/super", label: "Overview", icon: LayoutGrid },
        { href: "/admin/tenants", label: "Tenants", icon: Building2 },
        { href: "/admin/super/users", label: "Users", icon: UserCog },
        { href: "/admin/cron", label: "Cron Jobs", icon: Zap },
        { href: "/admin/account-settings", label: "Account Settings", icon: Settings },
      ]
    : [];

  return (
    <SidebarProvider>
      <Sidebar side="left" collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex h-14 items-center gap-2 px-2">
            <SidebarTrigger className="md:hidden" />
            <Link href="/admin/dashboard" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground hover:text-primary transition-colors min-w-0">
              <img src={logoImage} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" width={32} height={32} />
              <span className="truncate">FinJoe</span>
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
                      : itemPath === "/admin/help"
                        ? locPath.startsWith("/admin/help")
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
          {isSuperAdmin && platformNavItems.length > 0 && (
            <>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupLabel>Platform</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {platformNavItems.map((item) => {
                      const locPath = location.split("?")[0];
                      const itemPath = item.href.split("?")[0];
                      const isActive =
                        itemPath === "/admin/super"
                          ? locPath === "/admin/super"
                          : itemPath === "/admin/super/users"
                            ? locPath === "/admin/super/users"
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
            </>
          )}
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
        {user?.isDemoTenant && user?.realTenantId && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-amber-950 dark:text-amber-100 max-w-[min(100%,42rem)]">
              You&apos;re viewing <strong>demo data</strong> (ACME sandbox). Switch to your real workspace when ready.
            </p>
            <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setSwitchOpen(true)}>
              Switch to your data
            </Button>
          </div>
        )}
        {user?.isDemoTenant && user?.demoExpiresAt && (() => {
          const end = new Date(user.demoExpiresAt).getTime();
          const daysLeft = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
          if (Number.isNaN(end) || daysLeft > 14) return null;
          return (
            <div
              className={`border-b px-4 py-2 text-sm ${
                daysLeft <= 3
                  ? "bg-destructive/15 border-destructive/30 text-destructive"
                  : "bg-orange-500/10 border-orange-500/25 text-orange-950 dark:text-orange-100"
              }`}
            >
              {daysLeft <= 0
                ? "Your demo workspace has expired or will be deactivated soon. Switch to your real workspace or contact support."
                : `Demo workspace expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Switch when you’re ready.`}
            </div>
          );
        })()}
        <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Switch to your real data?</DialogTitle>
              <DialogDescription>
                Your production workspace starts empty. We can help you connect WhatsApp, branches, and categories.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-2 py-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={wantsSalesHelp}
                onChange={(e) => setWantsSalesHelp(e.target.checked)}
                className="rounded border-input"
              />
              Have the sales team contact me for onboarding help
            </label>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setSwitchOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => switchMutation.mutate()} disabled={switchMutation.isPending}>
                {switchMutation.isPending ? "Switching…" : "Use my workspace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
          <SidebarTrigger className="md:hidden" />
        </header>
        <div className="flex-1 p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
