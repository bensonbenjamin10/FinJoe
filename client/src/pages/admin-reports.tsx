import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  FileSpreadsheet,
  Download,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ArrowLeft,
  BarChart3,
  PieChart as PieChartIcon,
  Layers,
  ChevronRight,
} from "lucide-react";
import { FYSelector, getCurrentFY, isCurrentFY, getCurrentFYMonthIndex, getFYRangeLabel } from "@/components/mis/fy-selector";
import { StatSparkCard } from "@/components/mis/stat-spark-card";
import { MISTable, type MISRow } from "@/components/mis/mis-table";
import { CellDrilldown } from "@/components/mis/cell-drilldown";

// ── Types matching backend (dynamic) ──

interface MISLineItem {
  label: string;
  slug?: string;
  values: number[];
  fyTotal: number;
}

interface MISDrilldownSection {
  slug: string;
  label: string;
  mode: "by_center" | "by_subcategory";
  items: MISLineItem[];
  total: MISLineItem;
}

interface MISReport {
  months: string[];
  fyLabel: string;
  fyStartMonth: number;
  cashflow: {
    openingBalance: number[];
    inflows: MISLineItem[];
    totalIncome: MISLineItem;
    outflows: MISLineItem[];
    totalOutflow: MISLineItem;
    netOperating: MISLineItem;
    investingActivities: MISLineItem[];
    netInvesting: MISLineItem;
    netCashFlow: MISLineItem;
    closingBalance: number[];
  };
  pnl: {
    revenueGroups: MISLineItem[];
    totalRevenue: MISLineItem;
    directExpenses: MISLineItem[];
    totalDirectExpenses: MISLineItem;
    grossProfit: MISLineItem;
    grossProfitPct: number[];
    otherIncome: MISLineItem;
    indirectExpenses: MISLineItem[];
    totalIndirectExpenses: MISLineItem;
    ebitda: MISLineItem;
    ebitdaPct: number[];
  };
  drilldowns: {
    revenueByCenter: MISLineItem[];
    totalRevenueByCenter: MISLineItem;
    sections: MISDrilldownSection[];
  };
}

type ViewMode = "overview" | "cashflow" | "pnl" | "revenue" | "expenses";

const CHART_COLORS = [
  "hsl(174, 84%, 32%)",
  "hsl(38, 59%, 58%)",
  "hsl(280, 65%, 45%)",
  "hsl(30, 80%, 48%)",
  "hsl(340, 75%, 48%)",
  "hsl(200, 70%, 50%)",
  "hsl(120, 50%, 40%)",
  "hsl(10, 70%, 55%)",
];

function formatLakh(n: number): string {
  const abs = Math.abs(n);
  const neg = n < 0 ? "-" : "";
  if (abs >= 10000000) return `${neg}${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${neg}${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${neg}${(abs / 1000).toFixed(0)}K`;
  return `${neg}${abs.toLocaleString("en-IN")}`;
}

function formatCurrency(n: number): string {
  return `₹${formatLakh(n)}`;
}

// ── Main Component ──

const VALID_VIEWS: ViewMode[] = ["overview", "cashflow", "pnl", "revenue", "expenses"];

export default function AdminReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : (user?.tenantId ?? null);

  const fy = useMemo(() => {
    const urlFy = searchParams.get("fy");
    return urlFy && /^\d{4}-\d{2}$/.test(urlFy) ? urlFy : getCurrentFY();
  }, [searchParams]);

  const view = useMemo(() => {
    const urlView = searchParams.get("view") as ViewMode;
    return urlView && VALID_VIEWS.includes(urlView) ? urlView : "overview";
  }, [searchParams]);

  const [ytdMode, setYtdMode] = useState(true);
  const [drilldownIdx, setDrilldownIdx] = useState(0);
  const [numberFormat, setNumberFormat] = useState<"standard" | "indian">("standard");

  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownInfo, setDrilldownInfo] = useState<{
    type: "expense" | "income";
    categorySlug: string;
    monthIdx: number;
    monthLabel: string;
    label: string;
  } | null>(null);

  const tenantParam = tenantId ? `&tenantId=${tenantId}` : "";
  const showYtd = isCurrentFY(fy) && ytdMode;
  const todayISO = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const throughParam = showYtd ? `&through=${todayISO}` : "";

  const { data: report, isLoading, error } = useQuery<MISReport>({
    queryKey: ["/api/admin/mis/report", fy, tenantId, showYtd ? todayISO : "full"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/mis/report?fy=${fy}${tenantParam}${throughParam}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch MIS report");
      return res.json();
    },
    enabled: !isSuperAdmin || !!tenantId,
  });

  const fyStartMonth = report?.fyStartMonth ?? 4;

  const handleFYChange = useCallback((newFy: string) => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set("fy", newFy);
      return `?${next}`;
    });
  }, [setSearchParams]);

  const handleViewChange = useCallback((newView: ViewMode) => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      if (newView === "overview") {
        next.delete("view");
      } else {
        next.set("view", newView);
      }
      return `?${next}`;
    });
  }, [setSearchParams]);

  const handleCellClick = useCallback(
    (row: MISRow, monthIdx: number) => {
      if (!row.categorySlug || !report) return;
      setDrilldownInfo({
        type: row.transactionType ?? "expense",
        categorySlug: row.categorySlug,
        monthIdx,
        monthLabel: report.months[monthIdx],
        label: row.label,
      });
      setDrilldownOpen(true);
    },
    [report]
  );

  const handleExport = useCallback(async () => {
    const url = `/api/admin/mis/export?fy=${fy}${tenantParam}${throughParam}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `MIS_${fy}${showYtd ? "_YTD" : ""}.xlsx`;
    a.click();
  }, [fy, tenantParam, throughParam, showYtd]);

  if (isSuperAdmin && !tenantId) {
    return (
      <div className="p-12 text-center">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Select a tenant</h2>
        <p className="text-sm text-muted-foreground">Choose a tenant from the sidebar to view MIS reports.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Failed to load MIS report. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="dash-section flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {view !== "overview" && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewChange("overview")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {view === "overview" ? "Reports & MIS" : view === "cashflow" ? "Cashflow Statement" : view === "pnl" ? "Profit & Loss" : view === "revenue" ? "Revenue Analysis" : "Expense Analysis"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {view === "overview"
                ? "Financial overview and management information system"
                : "Monthly breakdown with drill-down capability"}
              {report && (
                <span className="ml-1 text-xs text-muted-foreground/70">
                  — {report.fyLabel} ({getFYRangeLabel(fyStartMonth)})
                  {isCurrentFY(fy, fyStartMonth) && `, data through ${new Date().toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}`}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(view === "cashflow" || view === "pnl") && (
            <Select value={numberFormat} onValueChange={(v) => setNumberFormat(v as "standard" | "indian")}>
              <SelectTrigger className="w-[110px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="indian">Lakhs/Cr</SelectItem>
              </SelectContent>
            </Select>
          )}
          <FYSelector value={fy} onChange={handleFYChange} fyStartMonth={fyStartMonth} />
          {isCurrentFY(fy, fyStartMonth) && (
            <Button
              variant={ytdMode ? "default" : "outline"}
              size="sm"
              className="text-xs h-9 px-3"
              onClick={() => setYtdMode((v) => !v)}
            >
              {ytdMode ? "YTD" : "Full Year"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingSkeleton /> : report ? (
        <>
          {view === "overview" && <OverviewView report={report} onNavigate={handleViewChange} fy={fy} fyStartMonth={fyStartMonth} />}
          {view === "cashflow" && <CashflowView report={report} onCellClick={handleCellClick} numberFormat={numberFormat} />}
          {view === "pnl" && <PnLView report={report} onCellClick={handleCellClick} numberFormat={numberFormat} />}
          {view === "revenue" && <RevenueView report={report} onCellClick={handleCellClick} numberFormat={numberFormat} />}
          {view === "expenses" && (
            <ExpenseView
              report={report}
              onCellClick={handleCellClick}
              numberFormat={numberFormat}
              drilldownIdx={drilldownIdx}
              onDrilldownIdxChange={setDrilldownIdx}
            />
          )}
        </>
      ) : null}

      {drilldownInfo && (
        <CellDrilldown
          open={drilldownOpen}
          onClose={() => setDrilldownOpen(false)}
          fy={fy}
          type={drilldownInfo.type}
          categorySlug={drilldownInfo.categorySlug}
          monthIdx={drilldownInfo.monthIdx}
          monthLabel={drilldownInfo.monthLabel}
          label={drilldownInfo.label}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}

// ── Loading State ──

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[300px] rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[180px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Overview View ──

function OverviewView({ report, onNavigate, fy, fyStartMonth }: { report: MISReport; onNavigate: (v: ViewMode) => void; fy: string; fyStartMonth: number }) {
  const { pnl, cashflow } = report;

  const totalRevenue = pnl.totalRevenue.fyTotal;
  const totalExpenses = pnl.totalDirectExpenses.fyTotal + pnl.totalIndirectExpenses.fyTotal;
  const ebitda = pnl.ebitda.fyTotal;
  const closingCash = cashflow.closingBalance[cashflow.closingBalance.length - 1];

  const currentMonthIdx = isCurrentFY(fy, fyStartMonth) ? getCurrentFYMonthIndex(fyStartMonth) : 11;
  const futureMonthLabel = currentMonthIdx < 11 ? report.months[currentMonthIdx] : null;

  const trendData = report.months.map((m, i) => ({
    month: m,
    revenue: pnl.totalRevenue.values[i],
    expenses: pnl.totalDirectExpenses.values[i] + pnl.totalIndirectExpenses.values[i],
  }));

  const expensePieData = useMemo(() => {
    const sorted = pnl.indirectExpenses
      .map((item) => ({ name: item.label, value: item.fyTotal }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, d) => s + d.value, 0);
    const threshold = total * 0.03;
    const major: typeof sorted = [];
    let otherTotal = 0;
    for (const d of sorted) {
      if (d.value >= threshold || major.length < 5) {
        major.push(d);
      } else {
        otherTotal += d.value;
      }
    }
    if (otherTotal > 0) major.push({ name: "Other", value: otherTotal });
    return major.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [pnl.indirectExpenses]);

  const revCenterData = report.drilldowns.revenueByCenter
    .slice(0, 8)
    .map((item) => ({
      name: item.label.length > 12 ? item.label.slice(0, 12) + "..." : item.label,
      fullName: item.label,
      value: item.fyTotal,
    }));

  const reportCards: { title: string; description: string; view: ViewMode; icon: typeof FileSpreadsheet; sparkData: number[]; color: string }[] = [
    { title: "Cashflow Statement", description: "Operating, investing & financing activities", view: "cashflow", icon: Layers, sparkData: cashflow.netCashFlow.values, color: "hsl(174, 84%, 32%)" },
    { title: "Profit & Loss", description: "Revenue, expenses, gross margin & EBITDA", view: "pnl", icon: BarChart3, sparkData: pnl.ebitda.values, color: "hsl(38, 59%, 58%)" },
    { title: "Revenue Analysis", description: "Revenue breakdown by centre & stream", view: "revenue", icon: TrendingUp, sparkData: pnl.totalRevenue.values, color: "hsl(200, 70%, 50%)" },
    { title: "Expense Analysis", description: "Drill into expense categories", view: "expenses", icon: PieChartIcon, sparkData: pnl.totalIndirectExpenses.values, color: "hsl(340, 75%, 48%)" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatSparkCard icon={TrendingUp} label="Total Revenue" value={formatCurrency(totalRevenue)} sparkData={pnl.totalRevenue.values} accentColor="hsl(174, 84%, 32%)" />
        <StatSparkCard icon={Receipt} label="Total Expenses" value={formatCurrency(totalExpenses)} sparkData={pnl.totalDirectExpenses.values.map((v, i) => v + pnl.totalIndirectExpenses.values[i])} accentColor="hsl(340, 75%, 48%)" />
        <StatSparkCard icon={ebitda >= 0 ? TrendingUp : TrendingDown} label="EBITDA" value={formatCurrency(ebitda)} sparkData={pnl.ebitda.values} trend={totalRevenue ? (ebitda / totalRevenue) * 100 : 0} trendLabel="of revenue" accentColor={ebitda >= 0 ? "hsl(142, 71%, 35%)" : "hsl(0, 72%, 51%)"} />
        <StatSparkCard icon={Wallet} label="Cash Position" value={formatCurrency(closingCash)} sparkData={cashflow.closingBalance} accentColor="hsl(280, 65%, 45%)" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Revenue vs Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(174, 84%, 32%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(174, 84%, 32%)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(340, 75%, 48%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(340, 75%, 48%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatLakh(v)} className="text-muted-foreground" axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={(value: number, name: string) => [`₹${value.toLocaleString("en-IN")}`, name === "revenue" ? "Revenue" : "Expenses"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(174, 84%, 32%)" fill="url(#revGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="hsl(340, 75%, 48%)" fill="url(#expGrad)" strokeWidth={2} />
                {futureMonthLabel && (
                  <ReferenceLine x={futureMonthLabel} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Today", position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Financial Statements</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reportCards.map((card) => (
              <Card key={card.view} className="group cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200" onClick={() => onNavigate(card.view)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${card.color} 12%, transparent)` }}>
                      <card.icon className="h-4.5 w-4.5" style={{ color: card.color }} />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-0.5">{card.title}</div>
                  <div className="text-xs text-muted-foreground">{card.description}</div>
                  <div className="mt-3"><MiniSparkSvg data={card.sparkData} color={card.color} /></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Quick Insights</h3>
          {expensePieData.length > 0 && (
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Indirect Expenses Breakdown</CardTitle></CardHeader>
              <CardContent className="pb-4">
                <div className="h-[160px] flex items-center">
                  <ResponsiveContainer width="50%" height="100%">
                    <PieChart>
                      <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none">
                        {expensePieData.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 pl-2 overflow-hidden">
                    {expensePieData.slice(0, 5).map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                        <span className="truncate text-muted-foreground">{d.name}</span>
                        <span className="ml-auto font-medium tabular-nums">{formatLakh(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {revCenterData.length > 0 && (
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Revenue by Centre</CardTitle></CardHeader>
              <CardContent className="pb-4">
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revCenterData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={formatLakh} axisLine={false} tickLine={false} width={50} />
                      <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Revenue"]} labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.fullName ?? ""} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="value" fill="hsl(174, 84%, 32%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniSparkSvg({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const h = 28, w = 120;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = w / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`);
  const gradId = `minigrad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.2} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <polygon points={`${points.join(" ")} ${w},${h} 0,${h}`} fill={`url(#${gradId})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Cashflow View ──

function CashflowView({ report, onCellClick, numberFormat }: { report: MISReport; onCellClick: (row: MISRow, monthIdx: number) => void; numberFormat: "standard" | "indian" }) {
  const { cashflow, months, fyLabel } = report;
  const rows = useMemo<MISRow[]>(() => {
    const r: MISRow[] = [];
    let idx = 0;
    const row = (label: string, values: number[], type: MISRow["type"], opts?: Partial<MISRow>): MISRow => ({ id: `cf-${idx++}`, label, values, fyTotal: values.reduce((a, b) => a + b, 0), type, ...opts });

    r.push(row("Opening Balance", cashflow.openingBalance, "data"));
    r.push({ id: `cf-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row("Inflow", new Array(12).fill(0), "section", { section: "inflow" }));
    for (const item of cashflow.inflows) {
      r.push(row(item.label, item.values, "data", { section: "inflow", indent: 1, categorySlug: item.slug, transactionType: "income" }));
    }
    r.push(row(cashflow.totalIncome.label, cashflow.totalIncome.values, "total"));
    r.push({ id: `cf-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row("Outflow", new Array(12).fill(0), "section", { section: "outflow" }));
    for (const item of cashflow.outflows) {
      r.push(row(item.label, item.values, "data", { section: "outflow", indent: 1, categorySlug: item.slug, transactionType: "expense" }));
    }
    r.push(row(cashflow.totalOutflow.label, cashflow.totalOutflow.values, "total"));
    r.push(row(cashflow.netOperating.label, cashflow.netOperating.values, "total"));
    r.push({ id: `cf-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row("Cash Flows from Investing Activities", new Array(12).fill(0), "section", { section: "investing" }));
    for (const item of cashflow.investingActivities) {
      r.push(row(item.label, item.values, "data", { section: "investing", indent: 1, categorySlug: item.slug, transactionType: "expense" }));
    }
    r.push(row(cashflow.netInvesting.label, cashflow.netInvesting.values, "total"));
    r.push({ id: `cf-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row(cashflow.netCashFlow.label, cashflow.netCashFlow.values, "total"));
    r.push(row("Closing Balance", cashflow.closingBalance, "total"));
    return r;
  }, [cashflow]);

  return <MISTable months={months} fyLabel={fyLabel} rows={rows} onCellClick={onCellClick} numberFormat={numberFormat} />;
}

// ── P&L View ──

function PnLView({ report, onCellClick, numberFormat }: { report: MISReport; onCellClick: (row: MISRow, monthIdx: number) => void; numberFormat: "standard" | "indian" }) {
  const { pnl, months, fyLabel } = report;
  const rows = useMemo<MISRow[]>(() => {
    const r: MISRow[] = [];
    let idx = 0;
    const row = (label: string, values: number[], type: MISRow["type"], opts?: Partial<MISRow>): MISRow => ({ id: `pnl-${idx++}`, label, values, fyTotal: values.reduce((a, b) => a + b, 0), type, ...opts });

    for (const rg of pnl.revenueGroups) {
      r.push(row(rg.label, rg.values, "data", { transactionType: "income", categorySlug: rg.slug }));
    }
    r.push(row(pnl.totalRevenue.label, pnl.totalRevenue.values, "total"));
    r.push({ id: `pnl-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row("Direct Expenses", new Array(12).fill(0), "section", { section: "direct" }));
    for (const item of pnl.directExpenses) {
      r.push(row(item.label, item.values, "data", { section: "direct", indent: 1, categorySlug: item.slug, transactionType: "expense" }));
    }
    r.push(row(pnl.totalDirectExpenses.label, pnl.totalDirectExpenses.values, "total"));
    r.push(row(pnl.grossProfit.label, pnl.grossProfit.values, "total"));
    r.push(row("Gross Profit (%)", pnl.grossProfitPct, "percentage"));
    r.push({ id: `pnl-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row(pnl.otherIncome.label, pnl.otherIncome.values, "data", { transactionType: "income" }));
    r.push({ id: `pnl-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row("Indirect Expenses", new Array(12).fill(0), "section", { section: "indirect" }));
    for (const item of pnl.indirectExpenses) {
      r.push(row(item.label, item.values, "data", { section: "indirect", indent: 1, categorySlug: item.slug, transactionType: "expense" }));
    }
    r.push(row(pnl.totalIndirectExpenses.label, pnl.totalIndirectExpenses.values, "total"));
    r.push({ id: `pnl-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row(pnl.ebitda.label, pnl.ebitda.values, "total"));
    r.push(row("EBITDA (%)", pnl.ebitdaPct, "percentage"));
    return r;
  }, [pnl]);

  return <MISTable months={months} fyLabel={fyLabel} rows={rows} onCellClick={onCellClick} numberFormat={numberFormat} />;
}

// ── Revenue View ──

function RevenueView({ report, onCellClick, numberFormat }: { report: MISReport; onCellClick: (row: MISRow, monthIdx: number) => void; numberFormat: "standard" | "indian" }) {
  const { drilldowns, months, pnl } = report;

  const rows = useMemo<MISRow[]>(() => {
    const r: MISRow[] = [];
    let idx = 0;
    const row = (label: string, values: number[], type: MISRow["type"], opts?: Partial<MISRow>): MISRow => ({ id: `rev-${idx++}`, label, values, fyTotal: values.reduce((a, b) => a + b, 0), type, ...opts });

    for (const rg of pnl.revenueGroups) {
      r.push(row(rg.label, rg.values, "data", { categorySlug: rg.slug, transactionType: "income" }));
    }
    r.push({ id: `rev-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row("Revenue by Centre", new Array(12).fill(0), "section", { section: "rev-center" }));
    for (const item of drilldowns.revenueByCenter) {
      r.push(row(item.label, item.values, "data", { section: "rev-center", indent: 1, transactionType: "income" }));
    }
    r.push(row(drilldowns.totalRevenueByCenter.label, drilldowns.totalRevenueByCenter.values, "total"));
    r.push({ id: `rev-${idx++}`, label: "", values: new Array(12).fill(0), type: "spacer" });
    r.push(row(pnl.totalRevenue.label, pnl.totalRevenue.values, "total"));
    return r;
  }, [drilldowns, pnl]);

  const centerNames = drilldowns.revenueByCenter.map((c) => c.label);
  const chartData = months.map((m, mi) => {
    const point: Record<string, string | number> = { month: m };
    for (const c of drilldowns.revenueByCenter) point[c.label] = c.values[mi];
    return point;
  });

  return (
    <div className="space-y-6">
      {centerNames.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by Centre (Monthly)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatLakh} axisLine={false} tickLine={false} width={55} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  {centerNames.map((name, i) => (<Bar key={name} dataKey={name} stackId="rev" fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
      <MISTable months={months} fyLabel={report.fyLabel} rows={rows} onCellClick={onCellClick} numberFormat={numberFormat} />
    </div>
  );
}

// ── Expense View (dynamic drilldown tabs from API) ──

function ExpenseView({ report, onCellClick, numberFormat, drilldownIdx, onDrilldownIdxChange }: {
  report: MISReport;
  onCellClick: (row: MISRow, monthIdx: number) => void;
  numberFormat: "standard" | "indian";
  drilldownIdx: number;
  onDrilldownIdxChange: (idx: number) => void;
}) {
  const { drilldowns, months, fyLabel } = report;
  const sections = drilldowns.sections;
  const safeIdx = Math.min(drilldownIdx, Math.max(sections.length - 1, 0));
  const selected = sections[safeIdx];

  const rows = useMemo<MISRow[]>(() => {
    if (!selected) return [];
    const r: MISRow[] = [];
    let idx = 0;
    const row = (label: string, values: number[], type: MISRow["type"], opts?: Partial<MISRow>): MISRow => ({ id: `exp-${idx++}`, label, values, fyTotal: values.reduce((a, b) => a + b, 0), type, ...opts });

    for (const item of selected.items) {
      r.push(row(item.label, item.values, "data", { categorySlug: selected.slug, transactionType: "expense" }));
    }
    r.push(row(selected.total.label, selected.total.values, "total"));
    return r;
  }, [selected]);

  const barData = selected?.items.map((item, i) => ({
    name: item.label.length > 18 ? item.label.slice(0, 18) + "..." : item.label,
    fullName: item.label,
    value: item.fyTotal,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  })) ?? [];

  if (sections.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No expense drilldown categories configured. Set "Drilldown Mode" on expense categories to enable.</div>;
  }

  return (
    <div className="space-y-4">
      <Tabs value={String(safeIdx)} onValueChange={(v) => onDrilldownIdxChange(parseInt(v, 10))}>
        <TabsList className="h-9">
          {sections.map((s, i) => (
            <TabsTrigger key={s.slug} value={String(i)} className="text-xs px-3">{s.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {barData.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatLakh} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Amount"]} labelFormatter={(_: string, payload: any[]) => payload?.[0]?.payload?.fullName ?? ""} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {barData.map((d, i) => (<Cell key={i} fill={d.fill} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <MISTable months={months} fyLabel={fyLabel} rows={rows} onCellClick={onCellClick} numberFormat={numberFormat} />
    </div>
  );
}
