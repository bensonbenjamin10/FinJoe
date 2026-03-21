import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "wouter";
import { format, isValid, parseISO } from "date-fns";
import { FileText, Eye, IndianRupee, AlertCircle, Receipt, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type InvoicingKpis = {
  outstandingAmount: number;
  outstandingCount: number;
  overdueCount: number;
  collectedThisMonth: number;
};

type InvoiceRow = {
  id: string | number;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  customerId: string;
  customerName: string;
  createdAt: string;
};

type InvoicesResponse = {
  rows: InvoiceRow[];
  total: number;
};

const STATUS_FILTER_VALUES = ["all", "draft", "issued", "partially_paid", "paid", "void"] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatInvoiceDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = parseISO(value);
  if (!isValid(d)) return "—";
  return format(d, "dd MMM yyyy");
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const label =
    s === "partially_paid"
      ? "Partially Paid"
      : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  switch (s) {
    case "draft":
      return <Badge variant="secondary">{label}</Badge>;
    case "issued":
      return (
        <Badge
          className="border-transparent bg-blue-100 text-blue-800 shadow-xs dark:bg-blue-900/40 dark:text-blue-300"
        >
          {label}
        </Badge>
      );
    case "partially_paid":
      return (
        <Badge
          className="border-transparent bg-amber-100 text-amber-900 shadow-xs dark:bg-amber-900/35 dark:text-amber-200"
        >
          {label}
        </Badge>
      );
    case "paid":
      return <Badge variant="success">{label}</Badge>;
    case "void":
      return <Badge variant="destructive">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

export default function AdminInvoicing() {
  const [location] = useLocation();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customerFilter, setCustomerFilter] = useState("");

  const tenantQuery = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const { data: kpis, isLoading: kpisLoading } = useQuery<InvoicingKpis>({
    queryKey: ["/api/admin/invoicing/kpis", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoicing/kpis${tenantQuery}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load KPIs");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery<InvoicesResponse>({
    queryKey: ["/api/admin/invoicing/invoices", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoicing/invoices${tenantQuery}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const filteredRows = useMemo(() => {
    const rows = invoiceData?.rows ?? [];
    const q = customerFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status.toLowerCase() !== statusFilter) return false;
      if (q && !row.customerName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invoiceData?.rows, statusFilter, customerFilter]);

  const newInvoiceHref =
    tenantId != null && tenantId !== ""
      ? `/admin/invoicing/new?tenantId=${encodeURIComponent(tenantId)}`
      : "/admin/invoicing/new";

  const detailHref = (id: string | number) => {
    const base = `/admin/invoicing/${id}`;
    return tenantId ? `${base}?tenantId=${encodeURIComponent(tenantId)}` : base;
  };

  const kpisGridLoading = kpisLoading || invoicesLoading;
  const rawRows = invoiceData?.rows ?? [];
  const isFilteredEmpty = filteredRows.length === 0 && rawRows.length > 0;

  return (
    <div className="space-y-8 p-4 md:p-6" key={location}>
      <PageHeader
        title="Invoicing"
        actions={
          <Button asChild>
            <Link href={newInvoiceHref}>New Invoice</Link>
          </Button>
        }
      />

      {!tenantId ? (
        <p className="text-sm text-muted-foreground">Select a tenant (add <code className="text-xs">?tenantId=</code> to the URL) to load invoicing data.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpisGridLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-36" />
                <Skeleton className="mt-2 h-3 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
                <IndianRupee className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatInr(kpis?.outstandingAmount ?? 0)}</p>
                <p className="text-xs text-muted-foreground">{kpis?.outstandingCount ?? 0} open invoice(s)</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-destructive">Overdue</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-destructive">{kpis?.overdueCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Invoices past due date</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Collected This Month</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatInr(kpis?.collectedThisMonth ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Payments received</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoices</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{invoiceData?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">All records for tenant</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              disabled={!tenantId}
            >
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Customer</p>
            <Input
              placeholder="Filter by customer name…"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              disabled={!tenantId}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {invoicesLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !tenantId ? null : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="rounded-full bg-muted p-4 text-muted-foreground">
                <FileText className="h-10 w-10" aria-hidden />
              </div>
              <div className="max-w-sm space-y-1">
                <p className="font-medium text-foreground">
                  {isFilteredEmpty ? "No matching invoices" : "No invoices to show"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isFilteredEmpty
                    ? "Try clearing the status or customer filters to see all invoices."
                    : "When you add invoices they will appear here. Create your first invoice to start tracking amounts, due dates, and payments in one place."}
                </p>
              </div>
              {!isFilteredEmpty ? (
                <Button asChild variant="secondary">
                  <Link href={newInvoiceHref}>Create your first invoice</Link>
                </Button>
              ) : (
                <Button variant="secondary" type="button" onClick={() => { setStatusFilter("all"); setCustomerFilter(""); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="w-[72px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatInvoiceDate(row.issueDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatInvoiceDate(row.dueDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatInr(row.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInr(row.amountPaid)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                          <Link href={detailHref(row.id)} aria-label={`View invoice ${row.invoiceNumber}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
