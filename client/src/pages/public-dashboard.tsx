import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  Lock,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──

type DashboardData = {
  tenantName: string;
  fyLabel: string;
  months: string[];
  kpis: {
    totalRevenue: number;
    totalDirectExpenses: number;
    totalIndirectExpenses: number;
    grossProfit: number;
    ebitda: number;
    netCashFlow: number;
    totalInflow: number;
    totalOutflow: number;
  };
  pnlSummary: {
    revenueGroups: { label: string; fyTotal: number }[];
    totalRevenue: number;
    grossProfit: number;
    ebitda: number;
    directExpenses: number;
    indirectExpenses: number;
  };
  cashflowTrend: { month: string; inflow: number; outflow: number; net: number }[];
  lastUpdated: string;
};

// ── Formatters ──

function formatCurrency(amount: number): string {
  if (Math.abs(amount) >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  }
  if (Math.abs(amount) >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1)}L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatCurrencyFull(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pctLabel(value: number, total: number): string {
  if (!total) return "";
  return ` (${((value / total) * 100).toFixed(1)}%)`;
}

// ── PIN Input ──

function PinInput({
  value,
  onChange,
  length = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    const chars = value.split("");
    chars[idx] = digit;
    const next = chars.join("").slice(0, length);
    onChange(next);
    if (digit && idx < length - 1) {
      inputs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!value[idx] && idx > 0) {
        inputs.current[idx - 1]?.focus();
        const chars = value.split("");
        chars[idx - 1] = "";
        onChange(chars.join(""));
      } else {
        const chars = value.split("");
        chars[idx] = "";
        onChange(chars.join(""));
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    inputs.current[focusIdx]?.focus();
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[idx] ?? ""}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          className="w-11 h-14 text-center text-2xl font-mono rounded-lg border-2 border-border bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
      ))}
    </div>
  );
}

// ── KPI Card ──

function KpiCard({
  label,
  value,
  sub,
  positive,
  neutral,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  neutral?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <p
          className={`text-2xl font-bold tracking-tight ${
            neutral
              ? "text-foreground"
              : positive === true
              ? "text-emerald-600"
              : positive === false
              ? "text-destructive"
              : "text-foreground"
          }`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── P&L Summary Table ──

function PnLRow({
  label,
  value,
  highlight,
  indent,
  negative,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  indent?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 ${
        highlight ? "border-t font-semibold" : "border-t border-border/40"
      } ${indent ? "pl-4" : ""}`}
    >
      <span className={`text-sm ${highlight ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span
        className={`text-sm font-mono tabular-nums ${
          highlight ? "font-semibold text-foreground" : negative ? "text-destructive" : "text-foreground"
        }`}
      >
        {formatCurrencyFull(value)}
      </span>
    </div>
  );
}

// ── Main Page ──

export default function PublicDashboard() {
  const { slug } = useParams() as { slug: string };
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [tenantName, setTenantName] = useState<string>("");

  const verifyMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await fetch("/api/public/dashboard/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Verification failed");
      }
      return res.json() as Promise<{ ok: boolean; tenantName: string }>;
    },
    onSuccess: (data) => {
      setAuthenticated(true);
      setTenantName(data.tenantName);
      setErrorMsg("");
    },
    onError: (err: Error) => {
      setErrorMsg(err.message);
      setPin("");
    },
  });

  const checkQuery = useQuery({
    queryKey: ["dashboard-check", slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/dashboard/${slug}/check`);
      if (res.status === 401) return { valid: false };
      if (!res.ok) return { valid: false };
      return res.json() as Promise<{ valid: boolean; tenantName?: string }>;
    },
    enabled: !!slug,
    retry: false,
  });

  useEffect(() => {
    if (checkQuery.data) {
      if (checkQuery.data.valid) {
        setAuthenticated(true);
        if (checkQuery.data.tenantName) setTenantName(checkQuery.data.tenantName);
      } else {
        setAuthenticated(false);
      }
    }
  }, [checkQuery.data]);

  const dataQuery = useQuery<DashboardData>({
    queryKey: ["dashboard-data", slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/dashboard/${slug}/data`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load data");
      }
      return res.json();
    },
    enabled: authenticated === true && !!slug,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) {
      setErrorMsg("Enter the full PIN");
      return;
    }
    verifyMutation.mutate(pin);
  }

  // ── Loading check ──
  if (checkQuery.isLoading || authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── PIN Gate ──
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Access</h1>
            <p className="text-muted-foreground mt-1 text-sm">Enter the PIN to view the dashboard</p>
          </div>
          <Card className="shadow-lg">
            <CardContent className="pt-6">
              <form onSubmit={handlePinSubmit} className="space-y-6">
                <PinInput value={pin} onChange={setPin} length={6} />
                {errorMsg && (
                  <div className="flex items-center gap-2 text-destructive text-sm justify-center">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={verifyMutation.isPending || pin.length < 4}
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  Access Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="text-center text-xs text-muted-foreground mt-6">
            Powered by <span className="font-semibold">FinJoe</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Dashboard ──

  const data = dataQuery.data;
  const isLoading = dataQuery.isLoading;
  const name = tenantName || data?.tenantName || "";

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">{name}</h1>
            {data && (
              <p className="text-xs text-muted-foreground">
                {data.fyLabel} &middot; Financial Overview
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <span className="hidden sm:block text-xs text-muted-foreground">
                Updated {format(new Date(data.lastUpdated), "dd MMM, h:mm a")}
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => dataQuery.refetch()}
              disabled={dataQuery.isFetching}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dataQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI row */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Key Metrics — {data?.fyLabel ?? "Current FY"}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {isLoading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-24 mb-1" /><Skeleton className="h-4 w-16" /></CardContent></Card>
                ))}
              </>
            ) : data ? (
              <>
                <KpiCard
                  label="Total Revenue"
                  value={formatCurrency(data.kpis.totalRevenue)}
                  sub={formatCurrencyFull(data.kpis.totalRevenue)}
                  neutral
                />
                <KpiCard
                  label="Gross Profit"
                  value={formatCurrency(data.kpis.grossProfit)}
                  sub={data.kpis.totalRevenue ? `${((data.kpis.grossProfit / data.kpis.totalRevenue) * 100).toFixed(1)}% margin` : undefined}
                  positive={data.kpis.grossProfit >= 0}
                />
                <KpiCard
                  label="EBITDA"
                  value={formatCurrency(data.kpis.ebitda)}
                  sub={data.kpis.totalRevenue ? `${((data.kpis.ebitda / data.kpis.totalRevenue) * 100).toFixed(1)}% margin` : undefined}
                  positive={data.kpis.ebitda >= 0}
                />
                <KpiCard
                  label="Net Cashflow"
                  value={formatCurrency(data.kpis.netCashFlow)}
                  sub={data.kpis.netCashFlow >= 0 ? "Cash positive" : "Cash negative"}
                  positive={data.kpis.netCashFlow >= 0}
                />
              </>
            ) : null}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* P&L Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                P&amp;L Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : data ? (
                <div>
                  {data.pnlSummary.revenueGroups.length > 0 && (
                    <>
                      {data.pnlSummary.revenueGroups.map((g) => (
                        <PnLRow
                          key={g.label}
                          label={g.label}
                          value={g.fyTotal}
                          indent
                        />
                      ))}
                    </>
                  )}
                  <PnLRow label="Total Revenue" value={data.pnlSummary.totalRevenue} highlight />
                  <PnLRow
                    label="Direct Expenses"
                    value={data.pnlSummary.directExpenses}
                    negative
                    indent
                  />
                  <PnLRow label="Gross Profit" value={data.pnlSummary.grossProfit} highlight />
                  <PnLRow
                    label="Indirect Expenses"
                    value={data.pnlSummary.indirectExpenses}
                    negative
                    indent
                  />
                  <PnLRow label="EBITDA" value={data.pnlSummary.ebitda} highlight />
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Cashflow breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Cashflow Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : data ? (
                <div>
                  <PnLRow label="Total Inflow" value={data.kpis.totalInflow} />
                  <PnLRow label="Total Outflow" value={data.kpis.totalOutflow} negative indent />
                  <PnLRow
                    label="Net Cashflow"
                    value={data.kpis.netCashFlow}
                    highlight
                  />
                  <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Gross Margin</p>
                      <p className={`text-xl font-bold ${data.kpis.grossProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {data.kpis.totalRevenue
                          ? `${((data.kpis.grossProfit / data.kpis.totalRevenue) * 100).toFixed(1)}%`
                          : "—"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">EBITDA Margin</p>
                      <p className={`text-xl font-bold ${data.kpis.ebitda >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {data.kpis.totalRevenue
                          ? `${((data.kpis.ebitda / data.kpis.totalRevenue) * 100).toFixed(1)}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Cashflow Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Monthly Cashflow Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : data ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.cashflowTrend} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(v)}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrencyFull(value),
                      name === "inflow" ? "Inflow" : name === "outflow" ? "Outflow" : "Net",
                    ]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="inflow"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#inflowGrad)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="outflow"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#outflowGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
            {data && (
              <div className="flex items-center gap-4 mt-2 justify-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-emerald-500 rounded inline-block" /> Inflow
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-red-500 rounded inline-block" /> Outflow
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error state */}
        {dataQuery.isError && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Failed to load dashboard data</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {(dataQuery.error as Error)?.message ?? "Unknown error"}
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => dataQuery.refetch()}>
                  Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="text-center py-8 text-xs text-muted-foreground">
        Powered by <span className="font-semibold">FinJoe</span> &middot; Read-only view
      </footer>
    </div>
  );
}
