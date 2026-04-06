import { Link, useSearchParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";

export default function AdminPettyCash() {
  const { user, canApproveExpenses } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const { costCenterLabel } = useCostCenterLabel(tenantId);
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  const replenishmentsSearch = (() => {
    const p = new URLSearchParams();
    if (tenantId) p.set("tenantId", tenantId);
    p.set("limit", "30");
    return `?${p.toString()}`;
  })();
  const expensesTabHref = tenantId
    ? `/admin/expenses?tab=petty-cash&tenantId=${encodeURIComponent(tenantId)}`
    : "/admin/expenses?tab=petty-cash";

  const {
    data: funds = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<
    Array<{
      id: string;
      costCenterId: string;
      custodianId: string;
      imprestAmount: number;
      currentBalance: number;
      costCenterName: string | null;
      custodianName: string | null;
    }>
  >({
    queryKey: ["/api/admin/petty-cash/funds", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/petty-cash/funds${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load petty cash funds");
      return res.json();
    },
    enabled: !!tenantId && canApproveExpenses,
  });

  const { data: replenishments = [] } = useQuery<
    Array<{
      id: string;
      fundId: string;
      totalAmount: number;
      payoutMethod: string | null;
      payoutRef: string | null;
      createdAt: string;
      costCenterName: string | null;
    }>
  >({
    queryKey: ["/api/admin/petty-cash/replenishments", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/petty-cash/replenishments${replenishmentsSearch}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load replenishments");
      return res.json();
    },
    enabled: !!tenantId && canApproveExpenses,
  });

  if (!tenantId) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {isSuperAdmin ? "Select a tenant from the sidebar to view petty cash." : "No tenant context."}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canApproveExpenses) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Petty cash management requires finance or admin access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalImprest = funds.reduce((s, f) => s + f.imprestAmount, 0);
  const totalBalance = funds.reduce((s, f) => s + f.currentBalance, 0);
  const atRisk = funds.filter((f) => f.imprestAmount > 0 && f.currentBalance < f.imprestAmount * 0.2).length;

  return (
    <div className="w-full py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="h-7 w-7" />
            Petty Cash
          </h1>
          <p className="text-muted-foreground mt-1">
            Imprest and balances by {costCenterLabel.toLowerCase()}. Create funds and record replenishments from Expenses.
          </p>
        </div>
        <Button asChild>
          <Link href={expensesTabHref}>
            Expenses — Petty Cash tab
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>{(error as Error)?.message ?? "Failed to load"}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total imprest</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">₹ {totalImprest.toLocaleString("en-IN")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total float balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">₹ {totalBalance.toLocaleString("en-IN")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Funds low (&lt; 20% imprest)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold flex items-center gap-2">
            {atRisk > 0 ? <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden /> : null}
            {atRisk}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funds by {costCenterLabel}</CardTitle>
          <CardDescription>Custodian and current balance vs imprest.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : funds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No petty cash funds yet. Create one from the Expenses tab.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{costCenterLabel}</TableHead>
                  <TableHead>Custodian</TableHead>
                  <TableHead className="text-right">Imprest (₹)</TableHead>
                  <TableHead className="text-right">Balance (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.costCenterName ?? "—"}</TableCell>
                    <TableCell>{f.custodianName ?? f.custodianId}</TableCell>
                    <TableCell className="text-right">₹ {f.imprestAmount.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">₹ {f.currentBalance.toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent replenishments</CardTitle>
          <CardDescription>Reimbursements recorded to restore float.</CardDescription>
        </CardHeader>
        <CardContent>
          {replenishments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replenishments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>{costCenterLabel}</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {replenishments.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.createdAt).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell>{r.costCenterName ?? "—"}</TableCell>
                    <TableCell className="text-right">₹ {r.totalAmount.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="font-mono text-xs">{r.payoutRef ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
