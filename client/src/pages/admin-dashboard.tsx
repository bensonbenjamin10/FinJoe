import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Wallet,
  AlertCircle,
  Clock,
  CalendarIcon,
  Loader2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { format, isValid, subDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import { StatCard } from "@/components/stat-card";
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

  const { data: insights, isLoading: insightsLoading } = useQuery<{ insights: string | null }>({
    queryKey: ["/api/admin/analytics/insights", analyticsParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/insights?${analyticsParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
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

  return (
    <div className="w-full py-8 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Key metrics and predictions to support decision-making.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {datePreset === "custom" ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-[220px] justify-start text-left font-normal", !customRange?.from && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customRange?.from ? (
                    customRange.to ? (
                      <>
                        {format(customRange.from, "MMM d, yyyy")} – {format(customRange.to, "MMM d, yyyy")}
                      </>
                    ) : (
                      format(customRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    "Pick date range"
                  )}
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
          ) : null}
          <Select
            value={datePreset}
            onValueChange={(v) => setDatePreset(v as DatePreset)}
          >
            <SelectTrigger className="w-[180px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getDatePresets().map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
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
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {analyticsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : analyticsError ? (
        <QueryErrorState
          message="Failed to load analytics. Please try again."
          onRetry={() => refetchAnalytics()}
        />
      ) : analytics ? (
        <>
          {/* Row 1: KPI cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Receipt}
              value={formatCurrency(kpis.totalExpenses)}
              label="Total Expenses"
              trend={comparison?.expenseTrend}
              comparison="vs previous period"
            />
            <StatCard
              icon={TrendingUp}
              value={formatCurrency(kpis.totalIncome)}
              label="Total Income"
              trend={comparison?.incomeTrend}
              comparison="vs previous period"
            />
            <StatCard
              icon={Wallet}
              value={formatCurrency(kpis.netCashflow)}
              label="Net Cashflow"
              comparison={kpis.netCashflow >= 0 ? "Surplus" : "Deficit"}
            />
            <StatCard
              icon={Clock}
              value={String(kpis.pendingApprovals)}
              label="Pending Approvals"
            />
            <StatCard
              icon={AlertCircle}
              value={String(kpis.pendingRoleRequests)}
              label="Pending Role Requests"
            />
            <StatCard
              icon={AlertTriangle}
              value={String(kpis.pettyCashAtRisk)}
              label="Petty Cash at Risk"
            />
          </div>

          {/* AI Insights */}
          {(insightsLoading || insights?.insights) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Insights
                </CardTitle>
                <CardDescription>AI-generated summary of your financial trends</CardDescription>
              </CardHeader>
              <CardContent>
                {insightsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Generating insights...</span>
                  </div>
                ) : insights?.insights ? (
                  <p className="text-sm leading-relaxed">{insights.insights}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">AI insights require GEMINI_API_KEY to be configured.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Row 2: Trend charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expense vs Income</CardTitle>
                <CardDescription>Daily breakdown over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.timeSeries.length > 0 ? (
                  <div className="h-[300px]">
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
                                <div className="font-medium mt-1">{formatCurrency(p.expenses)} expenses</div>
                                <div className="font-medium">{formatCurrency(p.income)} income</div>
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="expenses" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
                        <Area type="monotone" dataKey="income" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No data for this period
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expenses by Category</CardTitle>
                <CardDescription>Top categories by amount</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.expensesByCategory.length > 0 ? (
                  <div className="h-[300px]">
                    <ChartContainer
                      config={Object.fromEntries(
                        analytics.expensesByCategory.slice(0, 6).map((c, i) => [c.name, { color: CHART_COLORS[i % CHART_COLORS.length] }])
                      )}
                      className="h-full w-full aspect-auto"
                    >
                      <PieChart>
                        <Pie
                          data={analytics.expensesByCategory.slice(0, 6)}
                          dataKey="amount"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {analytics.expensesByCategory.slice(0, 6).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No expense data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Expense by cost center + Top expenses */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expenses by {costCenterLabel}</CardTitle>
                <CardDescription>Breakdown by cost center</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.expensesByCostCenter.length > 0 ? (
                  <div className="h-[280px]">
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
                        <Bar dataKey="amount" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    No data
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Expenses by Category</CardTitle>
                <CardDescription>Drill-down to expense list</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.expensesByCategory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.expensesByCategory.slice(0, 8).map((row, i) => (
                        <TableRow key={`${row.name}-${i}`}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No expense data</div>
                )}
                <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                  <Link href={tenantId ? `/admin/expenses?tenantId=${tenantId}` : "/admin/expenses"}>
                    View all expenses
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Predictions */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cash Flow Forecast</CardTitle>
                <CardDescription>30-day projected net cash flow from today (income minus expenses)</CardDescription>
              </CardHeader>
              <CardContent>
                {predictionsLoading ? (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Projected Shortfall (7d)</div>
                      <div className="text-sm font-semibold text-muted-foreground">—</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Projected Shortfall (30d)</div>
                      <div className="text-sm font-semibold text-muted-foreground">—</div>
                    </div>
                  </div>
                ) : predictionsError ? (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Projected Shortfall (7d)</div>
                      <div className="text-sm font-semibold text-muted-foreground">—</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Projected Shortfall (30d)</div>
                      <div className="text-sm font-semibold text-muted-foreground">—</div>
                    </div>
                  </div>
                ) : predictions ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Projected Shortfall (7d)</div>
                        <div className="text-sm font-semibold">
                          {predictions.cashRequiredNextWeek != null ? formatCurrency(predictions.cashRequiredNextWeek) : "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Projected Shortfall (30d)</div>
                        <div className="text-sm font-semibold">
                          {predictions.cashRequiredHorizon != null ? formatCurrency(predictions.cashRequiredHorizon) : "—"}
                        </div>
                      </div>
                    </div>
                    {predictions.cashRequiredNextWeek === 0 && predictions.cashRequiredHorizon === 0 ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
                        No shortfall projected — forecast income exceeds expenses over this period.
                      </p>
                    ) : null}
                  </>
                ) : null}
                {predictionsLoading ? (
                  <div className="h-[280px] flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : predictionsError ? (
                  <div className="h-[280px] flex flex-col items-center justify-center gap-4">
                    <p className="text-muted-foreground text-sm">Failed to load forecast. Please try again.</p>
                    <Button variant="outline" size="sm" onClick={() => refetchPredictions()}>
                      Retry
                    </Button>
                  </div>
                ) : predictions?.cashflowForecast && predictions.cashflowForecast.length > 0 ? (
                  <div className="h-[280px]">
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
                        <Area type="monotone" dataKey="netPosition" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.4} />
                      </AreaChart>
                    </ChartContainer>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Range: {formatCurrency(predictions?.forecastRange?.min ?? 0)} to {formatCurrency(predictions?.forecastRange?.max ?? 0)}. Confidence: {(predictions?.confidence ?? "medium").toUpperCase()}.
                    </div>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    Insufficient data for forecast
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alerts</CardTitle>
                <CardDescription>Items requiring attention</CardDescription>
              </CardHeader>
              <CardContent>
                {predictionsLoading ? (
                  <div className="py-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : predictionsError ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-4">
                    <p className="text-muted-foreground text-sm">Failed to load alerts. Please try again.</p>
                    <Button variant="outline" size="sm" onClick={() => refetchPredictions()}>
                      Retry
                    </Button>
                  </div>
                ) : predictions?.alerts && predictions.alerts.length > 0 ? (
                  <ul className="space-y-2">
                    {predictions.alerts.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-sm">{a.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">No alerts at this time</div>
                )}
                {predictions?.driverFactors && predictions.driverFactors.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Key drivers</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {predictions.driverFactors.slice(0, 4).map((d, idx) => (
                        <li key={`${d}-${idx}`}>- {d}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {predictions?.accuracyTelemetry ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Backtest ({predictions.accuracyTelemetry.backtestDays}d) MAPE:
                    {" "}
                    {predictions.accuracyTelemetry.overallMape7d != null
                      ? `${predictions.accuracyTelemetry.overallMape7d}% overall`
                      : "insufficient history"}
                    {" "}
                    ({predictions.accuracyTelemetry.method})
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
