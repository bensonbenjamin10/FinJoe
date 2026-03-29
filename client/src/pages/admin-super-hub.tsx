import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Building2,
  Users,
  Zap,
  Settings,
  Loader2,
  Activity,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

type PlatformStats = {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  lastCronRun: { jobName: string; status: string; startedAt: string } | null;
};

const quickLinks = [
  {
    href: "/admin/tenants",
    title: "Tenants",
    description: "Create and manage organizations",
    icon: Building2,
  },
  {
    href: "/admin/super/users",
    title: "Users",
    description: "All tenant staff across workspaces",
    icon: Users,
  },
  {
    href: "/admin/cron",
    title: "Cron jobs",
    description: "Trigger scheduled jobs and view history",
    icon: Zap,
  },
  {
    href: "/admin/account-settings",
    title: "Account settings",
    description: "Platform notification defaults",
    icon: Settings,
  },
] as const;

export default function AdminSuperHub() {
  const { data: stats, isLoading, isError } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Platform overview"
        description="High-level metrics and shortcuts for platform operations."
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Could not load platform stats.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tenants</CardDescription>
              <CardTitle className="text-3xl font-display tabular-nums">
                {stats?.totalTenants ?? "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {stats?.activeTenants ?? 0} active
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tenant users</CardDescription>
              <CardTitle className="text-3xl font-display tabular-nums">
                {stats?.totalUsers ?? "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Dashboard accounts with a tenant
            </CardContent>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Last cron run
              </CardDescription>
              <CardTitle className="text-lg font-medium">
                {stats?.lastCronRun ? (
                  <>
                    <span className="font-mono">{stats.lastCronRun.jobName}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span
                      className={
                        stats.lastCronRun.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {stats.lastCronRun.status}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground font-normal">No runs recorded yet</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {stats?.lastCronRun?.startedAt
                ? format(new Date(stats.lastCronRun.startedAt), "PPpp")
                : "—"}
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Shortcuts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {quickLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition-colors hover:bg-muted/40 cursor-pointer">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <item.icon className="h-5 w-5 text-primary" />
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
