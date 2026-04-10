import { useState, useId, useMemo } from "react";
import { useSearchParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import {
  Receipt,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Clock,
  CalendarIcon,
  ClipboardCheck,
  Loader2,
  AlertTriangle,
  Building2,
  ChevronRight,
} from "lucide-react";
import { IntelligenceBrief } from "@/components/intelligence/IntelligenceBrief";
import { format, isValid, subDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import { QueryErrorState } from "@/components/query-error-state";
import { ChartContainer } from "@/components/ui/chart";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Campus } from "@shared/schema";
import type { DateRange } from "react-day-picker";

type DatePreset = "7" | "30" | "90" | "fy" | "all" | "custom";

function getLastFinancialYear(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 3) {
    return { start: `${year - 1}-04-01`, end: `${year}-03-31` };
  } else {
    return { start: `${year - 2}-04-01`, end: `${year - 1}-03-31` };
  }
}

function getLastFinancialYearLabel(): string {
  const { start } = getLastFinancialYear();
  const startYear = parseInt(start.slice(0, 4), 10);
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

function getDatePresets(): Array<{ value: DatePreset; label: string }> {
  return [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
    { value: "fy", label: `Last FY (${getLastFinancialYearLabel()})` },
    { value: "all", label: "All time" },
    { value: "custom", label: "Custom..." },
  ];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const CHART_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#6366f1"];

type AnalyticsData = {
  kpis: {
    totalExpenses: number;
    totalIncome: number;
    netCashflow: number;
    pendingApprovals: number;
    pendingRoleRequests: number;
    pettyCashAtRisk: number;
  };
  expensesByStatus: Record<string, { amount: number; count: number }>;
  expensesByCategory: Array<{ name: string; amount: number; count: number }>;
  expensesByCostCenter: Array<{ name: string; amount: number; count: number }>;
  incomeByCategory: Array<{ name: string; amount: number; count: number }>;
  timeSeries: Array<{ date: string; expenses: number; income: number }>;
  comparison: {
    prevTotalExpenses: number;
    prevTotalIncome: number;
    expenseTrend: number;
    incomeTrend: number;
  };
  cfoExtended?: {
    expenseCategoryHhi: number;
    top3CategorySharePct: number;
    top3CostCenterSharePct: number;
    topVendors: Array<{ name: string; amount: number; sharePct: number }>;
    pendingApprovalAging: {
      count: number;
      avgDays: number | null;
      medianDays: number | null;
      countOver7Days: number;
      maxDays: number | null;
    };
  };
};

type PredictionsData = {
  expenseForecast: Array<{ date: string; amount: number }>;
  incomeForecast: Array<{ date: string; amount: number }>;
  cashflowForecast: Array<{ date: string; netPosition: number }>;
  alerts: Array<{ type: string; message: string }>;
  avgDailyExpense: number;
  avgDailyIncome: number;
  startingBalance?: number;
  cashRequiredNextWeek?: number;
  cashRequiredHorizon?: number;
  forecastRange?: { min: number; max: number };
  confidence?: "low" | "medium" | "high";
  driverFactors?: string[];
  model?: string;
  engine?: string;
  accuracyTelemetry?: {
    method: string;
    backtestDays: number;
    trainingDays: number;
    expenseMape7d: number | null;
    incomeMape7d: number | null;
    overallMape7d: number | null;
  };
};

function formatCurrency(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

/* ── Inline sparkline (SVG) ──────────────────────────────────────────── */

function MiniSparkline({ data, color, className }: { data: number[]; color: string; className?: string }) {
  const gradId = useId().replace(/:/g, "");
  if (!data.length || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 36;
  const w = 100;
  const step = w / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const fillPoints = [...points, `${w},${h}`, `0,${h}`].join(" ");

  return (
    <svg width={w} height={h} className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`spk-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#spk-${gradId})`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Skeleton placeholder ────────────────────────────────────────────── */

function Skel({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/60", className)} />;
}

/* ══════════════════════════════════════════════════════════════════════ */

export default function AdminDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const { costCenterLabel } = useCostCenterLabel(tenantId);

  const today = new Date();
  const [datePreset, setDatePreset] = useState<DatePreset>("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => ({
    from: subDays(today, 30),
    to: today,
  }));

  const { startStr, endStr, periodDays } = (() => {
    switch (datePreset) {
      case "7":
        return {
          startStr: format(subDays(today, 7), "yyyy-MM-dd"),
          endStr: format(today, "yyyy-MM-dd"),
          periodDays: 7,
        };
      case "30":
        return {
          startStr: format(subDays(today, 30), "yyyy-MM-dd"),
          endStr: format(today, "yyyy-MM-dd"),
          periodDays: 30,
        };
      case "90":
        return {
          startStr: format(subDays(today, 90), "yyyy-MM-dd"),
          endStr: format(today, "yyyy-MM-dd"),
          periodDays: 90,
        };
      case "fy": {
        const fy = getLastFinancialYear();
        const days = Math.ceil((new Date(fy.end).getTime() - new Date(fy.start).getTime()) / (24 * 60 * 60 * 1000)) + 1;
        return { startStr: fy.start, endStr: fy.end, periodDays: days };
      }
      case "all":
        return {
          startStr: "2000-01-01",
          endStr: format(today, "yyyy-MM-dd"),
          periodDays: Math.ceil((today.getTime() - new Date("2000-01-01").getTime()) / (24 * 60 * 60 * 1000)) + 1,
        };
      case "custom": {
        const from = customRange?.from ?? subDays(today, 30);
        const to = customRange?.to ?? (customRange?.from ? today : today);
        const start = from;
        const end = customRange?.from && !customRange?.to ? today : to;
        const s = format(start, "yyyy-MM-dd");
        const e = format(end, "yyyy-MM-dd");
        const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        return { startStr: s, endStr: e, periodDays: Math.max(1, days) };
      }
    }
  })();

  const granularity = periodDays <= 31 ? "day" : periodDays <= 90 ? "week" : "month";

  const [costCenterFilter, setCostCenterFilter] = useState<string>("all");

  const { data: costCenters = [] } = useQuery<Campus[]>({
    queryKey: ["/api/admin/cost-centers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cost-centers${tenantId ? `?tenantId=${tenantId}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const analyticsParams = new URLSearchParams();
  if (tenantId) analyticsParams.append("tenantId", tenantId);
  analyticsParams.append("startDate", startStr);
  analyticsParams.append("endDate", endStr);
  analyticsParams.append("granularity", granularity);
  if (costCenterFilter && costCenterFilter !== "all") analyticsParams.append("costCenterId", costCenterFilter);

  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError, refetch: refetchAnalytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics", analyticsParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics?${analyticsParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: myApprovals = [] } = useQuery<Array<{ expenseId: string }>>({
    queryKey: ["/api/admin/my-approvals", tenantId],
    queryFn: async () => {
      const params = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const res = await fetch(`/api/admin/my-approvals${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: predictions, isLoading: predictionsLoading, isError: predictionsError, refetch: refetchPredictions } = useQuery<PredictionsData>({
    queryKey: ["/api/admin/analytics/predictions", tenantId, costCenterFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("tenantId", String(tenantId));
      params.append("horizonDays", "30");
      if (costCenterFilter && costCenterFilter !== "all") params.append("costCenterId", costCenterFilter);
      const res = await fetch(`/api/admin/analytics/predictions?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  /* ── No tenant selected ──────────────────────────────────────────── */

  if (!tenantId) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {isSuperAdmin ? "Select a tenant from the dropdown above to view the dashboard." : "Tenant context is required."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kpis = analytics?.kpis;
  const comparison = analytics?.comparison;
  const cfo = analytics?.cfoExtended;
  const granularityLabel = granularity === "day" ? "Daily" : granularity === "week" ? "Weekly" : "Monthly";

  const expenseSpark = useMemo(() => analytics?.timeSeries?.map((d) => d.expenses) ?? [], [analytics?.timeSeries]);
  const incomeSpark = useMemo(() => analytics?.timeSeries?.map((d) => d.income) ?? [], [analytics?.timeSeries]);
  const cashflowSpark = useMemo(() => analytics?.timeSeries?.map((d) => d.income - d.expenses) ?? [], [analytics?.timeSeries]);

  const topCategories = useMemo(() => analytics?.expensesByCategory?.slice(0, 6) ?? [], [analytics?.expensesByCategory]);
  const categoryTotal = useMemo(() => topCategories.reduce((s, c) => s + c.amount, 0), [topCategories]);

  return (
    <div className="w-full py-6 space-y-6">

      {/* ── S1 · Hero Bar ──────────────────────────────────────────── */}
      <div className="dash-section flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-[1.65rem] font-bold tracking-tight leading-tight">
            {getGreeting()}, {user?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(today, "EEEE, MMMM d, yyyy")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {datePreset === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-[220px] justify-start text-left font-normal", !customRange?.from && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customRange?.from ? (
                    customRange.to ? (
                      <>{format(customRange.from, "MMM d, yyyy")} – {format(customRange.to, "MMM d, yyyy")}</>
                    ) : format(customRange.from, "MMM d, yyyy")
                  ) : "Pick date range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={setCustomRange}
                  defaultMonth={customRange?.from ?? subDays(today, 30)}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          )}
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[180px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getDatePresets().map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={`All ${costCenterLabel}s`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {costCenterLabel}s</SelectItem>
              <SelectItem value="__corporate__">Corporate Office</SelectItem>
              {costCenters.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Loading skeleton ───────────────────────────────────────── */}
      {analyticsLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skel className="h-4 w-28" />
                    <Skel className="h-4 w-4 rounded" />
                  </div>
                  <Skel className="h-8 w-40" />
                  <div className="flex items-center gap-2">
                    <Skel className="h-3 w-16" />
                    <Skel className="h-3 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-6 space-y-3">
              <Skel className="h-5 w-52" />
              <Skel className="h-4 w-full" />
              <Skel className="h-4 w-4/5" />
              <Skel className="h-4 w-3/5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skel className="h-[340px] w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      ) : analyticsError ? (
        <QueryErrorState
          message="Failed to load analytics. Please try again."
          onRetry={() => refetchAnalytics()}
        />
      ) : analytics ? (
        <>
          {/* ── S2 · Financial Scoreboard ─────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Total Expenses */}
            <Card className="dash-section relative overflow-hidden group hover:shadow-md transition-shadow" style={{ animationDelay: "80ms" }}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-muted-foreground">Total Expenses</span>
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </div>
                    <div className="text-3xl font-bold tracking-tight tabular-nums">
                      {formatCurrency(kpis!.totalExpenses)}
                    </div>
                    {comparison && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full",
                          comparison.expenseTrend > 0
                            ? "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40"
                            : comparison.expenseTrend < 0
                              ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
                              : "text-muted-foreground bg-muted"
                        )}>
                          {comparison.expenseTrend > 0
                            ? <TrendingUp className="h-3 w-3" />
                            : comparison.expenseTrend < 0
                              ? <TrendingDown className="h-3 w-3" />
                              : null}
                          {comparison.expenseTrend > 0 ? "+" : ""}{comparison.expenseTrend.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">vs prev</span>
                      </div>
                    )}
                  </div>
                  <MiniSparkline data={expenseSpark} color="#ef4444" className="mt-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500/60 via-rose-500/20 to-transparent" />
            </Card>

            {/* Total Income */}
            <Card className="dash-section relative overflow-hidden group hover:shadow-md transition-shadow" style={{ animationDelay: "140ms" }}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-muted-foreground">Total Income</span>
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </div>
                    <div className="text-3xl font-bold tracking-tight tabular-nums">
                      {formatCurrency(kpis!.totalIncome)}
                    </div>
                    {comparison && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full",
                          comparison.incomeTrend > 0
                            ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
                            : comparison.incomeTrend < 0
                              ? "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40"
                              : "text-muted-foreground bg-muted"
                        )}>
                          {comparison.incomeTrend > 0
                            ? <TrendingUp className="h-3 w-3" />
                            : comparison.incomeTrend < 0
                              ? <TrendingDown className="h-3 w-3" />
                              : null}
                          {comparison.incomeTrend > 0 ? "+" : ""}{comparison.incomeTrend.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">vs prev</span>
                      </div>
                    )}
                  </div>
                  <MiniSparkline data={incomeSpark} color="#10b981" className="mt-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500/60 via-emerald-500/20 to-transparent" />
            </Card>

            {/* Net Cashflow */}
            <Card className="dash-section relative overflow-hidden group hover:shadow-md transition-shadow" style={{ animationDelay: "200ms" }}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-muted-foreground">Net Cashflow</span>
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </div>
                    <div className="text-3xl font-bold tracking-tight tabular-nums">
                      {formatCurrency(kpis!.netCashflow)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                        kpis!.netCashflow >= 0
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      )}>
                        {kpis!.netCashflow >= 0 ? "Surplus" : "Deficit"}
                      </span>
                    </div>
                  </div>
                  <MiniSparkline
                    data={cashflowSpark}
                    color={kpis!.netCashflow >= 0 ? "#0ea5e9" : "#f59e0b"}
                    className="mt-2 opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </CardContent>
              <div className={cn(
                "absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r to-transparent",
                kpis!.netCashflow >= 0 ? "from-sky-500/60 via-sky-500/20" : "from-amber-500/60 via-amber-500/20"
              )} />
            </Card>
          </div>

          {/* ── Action Items Strip ────────────────────────────────── */}
          {(myApprovals.length > 0 || kpis!.pendingApprovals > 0 || kpis!.pendingRoleRequests > 0 || kpis!.pettyCashAtRisk > 0) && (
            <div className="dash-section flex items-center flex-wrap gap-x-5 gap-y-2 px-4 py-2.5 rounded-lg border bg-card text-sm" style={{ animationDelay: "260ms" }}>
              {myApprovals.length > 0 && (
                <Link href={`/admin/my-approvals${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`}>
                  <span className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline underline-offset-4 cursor-pointer py-1 -my-1">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    {myApprovals.length} awaiting your review
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </span>
                </Link>
              )}
              {myApprovals.length > 0 && (kpis!.pendingApprovals > 0 || kpis!.pendingRoleRequests > 0 || kpis!.pettyCashAtRisk > 0) && (
                <div className="h-4 w-px bg-border" />
              )}
              {kpis!.pendingApprovals > 0 && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground tabular-nums">{kpis!.pendingApprovals}</span> org approvals pending
                </span>
              )}
              {kpis!.pendingRoleRequests > 0 && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-medium text-foreground tabular-nums">{kpis!.pendingRoleRequests}</span> role requests
                  </span>
                </>
              )}
              {kpis!.pettyCashAtRisk > 0 && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="font-medium tabular-nums">{kpis!.pettyCashAtRisk}</span> petty cash at risk
                  </span>
                </>
              )}
            </div>
          )}

          {/* ── S3 · FinJoe Intelligence Platform ───────────────────── */}
          {tenantId && (
            <IntelligenceBrief
              tenantId={tenantId}
              startDate={startStr}
              endDate={endStr}
              costCenterId={costCenterFilter !== "all" ? costCenterFilter : undefined}
              granularity={granularity}
              className="dash-section"
            />
          )}

          {/* ── S4 · Cash Flow Trend (full width) ────────────────── */}
          <Card className="dash-section" style={{ animationDelay: "380ms" }}>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Cash Flow Trend</CardTitle>
                  <CardDescription>{granularityLabel} breakdown over the selected period</CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                    Expenses
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                    Income
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {analytics.timeSeries.length > 0 ? (
                <div className="h-[340px]">
                  <ChartContainer
                    config={{
                      expenses: { label: "Expenses", color: "#ef4444" },
                      income: { label: "Income", color: "#10b981" },
                    }}
                    className="h-full w-full aspect-auto"
                  >
                    <AreaChart data={analytics.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MMM d")} />
                      <YAxis tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload;
                          const d = new Date(p.date);
                          if (!isValid(d)) return <div className="rounded-lg border bg-background p-2 shadow-sm">{p.date ?? "—"}</div>;
                          return (
                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                              <div className="text-xs text-muted-foreground">{format(d, "PPP")}</div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                                <span className="font-medium">{formatCurrency(p.expenses)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                                <span className="font-medium">{formatCurrency(p.income)}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.35} />
                      <Area type="monotone" dataKey="income" stroke="#10b981" fill="#10b981" fillOpacity={0.35} />
                    </AreaChart>
                  </ChartContainer>
                </div>
              ) : (
                <div className="h-[340px] flex items-center justify-center text-muted-foreground">
                  No data for this period
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── S5 · Expense Intelligence Grid ───────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Donut + integrated legend */}
            <Card className="dash-section" style={{ animationDelay: "440ms" }}>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>Category distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {topCategories.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-[200px] h-[200px] shrink-0 relative">
                      <ChartContainer
                        config={Object.fromEntries(
                          topCategories.map((c, i) => [c.name, { color: CHART_COLORS[i % CHART_COLORS.length] }])
                        )}
                        className="h-full w-full aspect-auto"
                      >
                        <PieChart>
                          <Pie
                            data={topCategories}
                            dataKey="amount"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={2}
                            strokeWidth={0}
                          >
                            {topCategories.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        </PieChart>
                      </ChartContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-xs font-medium text-muted-foreground">Total</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(categoryTotal)}</span>
                      </div>
                    </div>
                    <div className="flex-1 w-full space-y-2.5">
                      {topCategories.map((cat, i) => {
                        const pct = categoryTotal > 0 ? (cat.amount / categoryTotal) * 100 : 0;
                        return (
                          <div key={`${cat.name}-${i}`} className="flex items-center gap-2.5 text-sm">
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                            <span className="flex-1 truncate">{cat.name}</span>
                            <span className="tabular-nums text-xs text-muted-foreground shrink-0">{pct.toFixed(0)}%</span>
                            <span className="tabular-nums text-xs font-medium shrink-0 text-right">{formatCurrency(cat.amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No expense data
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-5 w-full" asChild>
                  <Link href={tenantId ? `/admin/expenses?tenantId=${tenantId}` : "/admin/expenses"}>
                    View all expenses
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Cost Center Bar */}
            <Card className="dash-section" style={{ animationDelay: "500ms" }}>
              <CardHeader>
                <CardTitle>Expenses by {costCenterLabel}</CardTitle>
                <CardDescription>Breakdown by cost center</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.expensesByCostCenter.length > 0 ? (
                  <div className="h-[300px]">
                    <ChartContainer
                      config={Object.fromEntries(
                        analytics.expensesByCostCenter.map((c, i) => [c.name, { color: CHART_COLORS[i % CHART_COLORS.length] }])
                      )}
                      className="h-full w-full aspect-auto"
                    >
                      <BarChart data={analytics.expensesByCostCenter} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── S6 · Forecast & Risk ─────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Cash Flow Forecast */}
            <Card className="dash-section" style={{ animationDelay: "560ms" }}>
              <CardHeader>
                <CardTitle>Cash Flow Forecast</CardTitle>
                <CardDescription>30-day projected net cash flow</CardDescription>
              </CardHeader>
              <CardContent>
                {predictionsLoading ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-lg border p-3"><Skel className="h-3 w-20 mb-1.5" /><Skel className="h-5 w-24" /></div>
                      <div className="rounded-lg border p-3"><Skel className="h-3 w-20 mb-1.5" /><Skel className="h-5 w-24" /></div>
                    </div>
                    <Skel className="h-[260px] w-full rounded-lg" />
                  </>
                ) : predictionsError ? (
                  <div className="h-[320px] flex flex-col items-center justify-center gap-4">
                    <p className="text-muted-foreground text-sm">Failed to load forecast.</p>
                    <Button variant="outline" size="sm" onClick={() => refetchPredictions()}>Retry</Button>
                  </div>
                ) : predictions ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Shortfall (7d)</div>
                        <div className="text-sm font-semibold tabular-nums mt-0.5">
                          {predictions.cashRequiredNextWeek != null ? formatCurrency(predictions.cashRequiredNextWeek) : "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Shortfall (30d)</div>
                        <div className="text-sm font-semibold tabular-nums mt-0.5">
                          {predictions.cashRequiredHorizon != null ? formatCurrency(predictions.cashRequiredHorizon) : "—"}
                        </div>
                      </div>
                    </div>
                    {predictions.cashRequiredNextWeek === 0 && predictions.cashRequiredHorizon === 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
                        No shortfall projected — income exceeds expenses.
                      </p>
                    )}
                    {predictions.cashflowForecast && predictions.cashflowForecast.length > 0 ? (
                      <div>
                        <div className="h-[260px]">
                          <ChartContainer
                            config={{ netPosition: { label: "Net Position", color: "#0ea5e9" } }}
                            className="h-full w-full aspect-auto"
                          >
                            <AreaChart data={predictions.cashflowForecast}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), "MMM d")} />
                              <YAxis tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const p = payload[0].payload;
                                  const d = new Date(p.date);
                                  if (!isValid(d)) return <div className="rounded-lg border bg-background p-2 shadow-sm">{p.date ?? "—"}</div>;
                                  return (
                                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                                      <div className="text-xs text-muted-foreground">{format(d, "PPP")}</div>
                                      <div className="font-medium mt-1">{formatCurrency(p.netPosition)} net</div>
                                    </div>
                                  );
                                }}
                              />
                              <Area type="monotone" dataKey="netPosition" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.35} />
                            </AreaChart>
                          </ChartContainer>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Range: {formatCurrency(predictions.forecastRange?.min ?? 0)} – {formatCurrency(predictions.forecastRange?.max ?? 0)} · Confidence: {(predictions.confidence ?? "medium").toUpperCase()}
                        </div>
                      </div>
                    ) : (
                      <div className="h-[260px] flex items-center justify-center text-muted-foreground">
                        Insufficient data for forecast
                      </div>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>

            {/* Alerts & Risk Signals */}
            <Card className="dash-section" style={{ animationDelay: "620ms" }}>
              <CardHeader>
                <CardTitle>Risk & Alerts</CardTitle>
                <CardDescription>Signals requiring attention</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Prediction alerts */}
                {predictionsLoading ? (
                  <div className="py-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : predictionsError ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-3">
                    <p className="text-muted-foreground text-sm">Failed to load alerts.</p>
                    <Button variant="outline" size="sm" onClick={() => refetchPredictions()}>Retry</Button>
                  </div>
                ) : (
                  <>
                    {predictions?.alerts && predictions.alerts.length > 0 ? (
                      <ul className="space-y-2">
                        {predictions.alerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                            <span className="text-sm">{a.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No active alerts</p>
                    )}

                    {/* Key drivers */}
                    {predictions?.driverFactors && predictions.driverFactors.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Drivers</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {predictions.driverFactors.slice(0, 4).map((d, idx) => (
                            <li key={`${d}-${idx}`} className="flex items-start gap-1.5">
                              <span className="text-muted-foreground/60 mt-px shrink-0">–</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {/* Vendor concentration (from cfoExtended) */}
                {cfo && cfo.topVendors && cfo.topVendors.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vendor Concentration</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Top 3 categories: {cfo.top3CategorySharePct.toFixed(0)}% of spend ·
                      {" "}{cfo.expenseCategoryHhi > 2500 ? "High" : cfo.expenseCategoryHhi > 1500 ? "Moderate" : "Diversified"} concentration
                    </div>
                    <div className="space-y-1">
                      {cfo.topVendors.slice(0, 3).map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="truncate mr-3">{v.name}</span>
                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span className="text-muted-foreground">{v.sharePct.toFixed(1)}%</span>
                            <span className="font-medium">{formatCurrency(v.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approval aging (from cfoExtended) */}
                {cfo?.pendingApprovalAging && cfo.pendingApprovalAging.count > 0 && (
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approval Aging</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-semibold tabular-nums">
                        {cfo.pendingApprovalAging.avgDays != null ? `${cfo.pendingApprovalAging.avgDays.toFixed(1)}d` : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">avg wait</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <div>{cfo.pendingApprovalAging.count} pending · {cfo.pendingApprovalAging.countOver7Days} overdue (&gt;7d)</div>
                      {cfo.pendingApprovalAging.maxDays != null && (
                        <div>Oldest: {cfo.pendingApprovalAging.maxDays}d</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Accuracy telemetry */}
                {predictions?.accuracyTelemetry && (
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Backtest ({predictions.accuracyTelemetry.backtestDays}d) MAPE:{" "}
                    {predictions.accuracyTelemetry.overallMape7d != null
                      ? `${predictions.accuracyTelemetry.overallMape7d}% overall`
                      : "insufficient history"}{" "}
                    ({predictions.accuracyTelemetry.method})
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
