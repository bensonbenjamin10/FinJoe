import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams, useSearchParams } from "wouter";
import { format, parseISO } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { CostCenter } from "@shared/schema";
import { QRCodeSVG } from "qrcode.react";
import {
  Ban,
  Calendar,
  Copy,
  CreditCard,
  IndianRupee,
  Loader2,
  Mail,
  Phone,
  QrCode,
  Send,
  User,
} from "lucide-react";

type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

type TaxBreakdownLine = {
  code: string;
  label: string;
  rate: number;
  amount: number;
};

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate: number;
  lineTotal: number;
  displayOrder: number;
  ext?: { hsnCode?: string; taxBreakdown?: TaxBreakdownLine[] };
};

type Allocation = {
  id: string;
  amount: number;
  provider: string;
  externalPaymentId: string | null;
  method: string | null;
  reference: string | null;
  paymentDate: string;
  createdAt: string;
};

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  customerId: string;
  costCenterId: string | null;
  incomeCategoryId: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ext?: {
    taxBreakdown?: TaxBreakdownLine[];
    supplierGstin?: string;
    customerGstin?: string;
    supplierGstinSource?: "invoice_override" | "cost_center" | "tenant" | null;
    supplierGstinOverride?: string;
    supplierStateCodeOverride?: string;
  };
  customer: { name: string; email: string | null; phone: string | null; gstin: string | null } | null;
  lines: InvoiceLine[];
  allocations: Allocation[];
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "other", label: "Other" },
] as const;

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDisplayDate(value: string | Date | null | undefined): string {
  if (value == null) return "—";
  try {
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "dd MMM yyyy");
  } catch {
    return "—";
  }
}

function supplierGstinSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "invoice_override":
      return "Invoice override";
    case "cost_center":
      return "Cost center default";
    case "tenant":
      return "Organization default";
    default:
      return "";
  }
}

function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "issued":
      return "Issued";
    case "partially_paid":
      return "Partially paid";
    case "paid":
      return "Paid";
    case "void":
      return "Void";
    default:
      return status;
  }
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const label = statusLabel(status);
  if (status === "draft") {
    return <Badge variant="secondary">{label}</Badge>;
  }
  if (status === "issued") {
    return <Badge variant="default">{label}</Badge>;
  }
  if (status === "partially_paid") {
    return (
      <Badge
        variant="outline"
        className="border-amber-400/80 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
      >
        {label}
      </Badge>
    );
  }
  if (status === "paid") {
    return <Badge variant="success">{label}</Badge>;
  }
  if (status === "void") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function InvoiceDetailSkeleton() {
  return (
    <div className="w-full space-y-6">
      <Skeleton className="h-5 w-64" />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-[280px] w-full rounded-xl" />
      <Skeleton className="h-[200px] w-full rounded-xl" />
    </div>
  );
}

export default function AdminInvoiceDetail() {
  const { id } = useParams() as { id: string };
  const [location] = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : (user?.tenantId ?? null);

  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentReference, setPaymentReference] = useState("");

  const invoicingListHref = useMemo(
    () => `/admin/invoicing${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`,
    [tenantId],
  );

  useEffect(() => {
    setVoidDialogOpen(false);
    setRecordPaymentOpen(false);
  }, [location]);

  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const {
    data: invoice,
    isLoading,
    error,
    isError,
  } = useQuery<InvoiceDetail>({
    queryKey: ["/api/admin/invoicing/invoices", id, tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoicing/invoices/${id}${qs}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Invoice not found");
        const text = await res.text();
        throw new Error(text || "Failed to load invoice");
      }
      return res.json();
    },
    enabled: !!id && !!tenantId,
  });

  const { data: detailCostCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ["/api/admin/cost-centers", tenantId, "invoice-detail"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cost-centers${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load cost centers");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: detailFinjoeSettings } = useQuery<{ costCenterLabel?: string | null }>({
    queryKey: ["/api/admin/finjoe/settings", tenantId, "invoice-detail"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/settings${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!tenantId,
  });
  const detailCostCenterLabel = detailFinjoeSettings?.costCenterLabel?.trim() || "Cost center";

  const invoiceCostCenterName = useMemo(() => {
    if (!invoice?.costCenterId) return null;
    return detailCostCenters.find((c) => c.id === invoice.costCenterId)?.name ?? null;
  }, [invoice?.costCenterId, detailCostCenters]);

  useEffect(() => {
    if (!recordPaymentOpen || !invoice) return;
    const remaining = Math.max(0, invoice.total - invoice.amountPaid);
    setPaymentAmount(remaining > 0 ? String(remaining) : "");
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setPaymentMethod("cash");
    setPaymentReference("");
  }, [recordPaymentOpen, invoice]);

  const invalidateInvoiceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/invoicing/invoices"] });
  };

  const tenantPayload = isSuperAdmin && tenantId ? { tenantId } : {};

  const issueMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/invoicing/invoices/${id}/issue`, tenantPayload);
    },
    onSuccess: () => {
      invalidateInvoiceQueries();
      toast({ title: "Invoice issued" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not issue invoice", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/invoicing/invoices/${id}/void`, tenantPayload);
    },
    onSuccess: () => {
      invalidateInvoiceQueries();
      setVoidDialogOpen(false);
      toast({ title: "Invoice voided" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not void invoice", description: e.message, variant: "destructive" }),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(paymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid amount");
      }
      const body = {
        ...tenantPayload,
        amount: Math.round(amount),
        method: paymentMethod || undefined,
        reference: paymentReference.trim() || undefined,
        paymentDate: paymentDate || undefined,
      };
      await apiRequest("POST", `/api/admin/invoicing/invoices/${id}/payments`, body);
    },
    onSuccess: () => {
      invalidateInvoiceQueries();
      setRecordPaymentOpen(false);
      toast({ title: "Payment recorded" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not record payment", description: e.message, variant: "destructive" }),
  });

  const copyPayLink = async () => {
    const url = `${window.location.origin}/pay/${invoice?.id ?? id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Pay link copied", description: url });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not write to the clipboard.",
        variant: "destructive",
      });
    }
  };

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/invoicing/invoices/${id}/send`, tenantPayload);
    },
    onSuccess: () => toast({ title: "Invoice sent", description: `Email sent to ${invoice?.customer?.email}` }),
    onError: (e: Error) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  const sortedLines = useMemo(() => {
    if (!invoice?.lines) return [];
    return [...invoice.lines].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [invoice?.lines]);

  const remainingBalance = invoice ? Math.max(0, invoice.total - invoice.amountPaid) : 0;
  const canVoid =
    invoice && invoice.status !== "void" && (invoice.allocations?.length ?? 0) === 0;
  const canRecordPayment =
    invoice &&
    invoice.status !== "draft" &&
    invoice.status !== "void" &&
    remainingBalance > 0;

  if (!tenantId) {
    return (
      <div className="w-full space-y-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={invoicingListHref}>Invoicing</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Invoice</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Alert>
          <AlertTitle>Tenant required</AlertTitle>
          <AlertDescription>
            Open this page from invoicing with a <code className="text-xs">tenantId</code> query
            parameter, or select a tenant context.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="w-full space-y-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={invoicingListHref}>Invoicing</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Invoice</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Alert variant="destructive">
          <AlertTitle>Missing invoice</AlertTitle>
          <AlertDescription>No invoice id in the URL.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <InvoiceDetailSkeleton />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="w-full space-y-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={invoicingListHref}>Invoicing</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Invoice</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Alert variant="destructive">
          <AlertTitle>Unable to load invoice</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : "Something went wrong."}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href={invoicingListHref}>Back to invoicing</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="w-full space-y-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={invoicingListHref}>Invoicing</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{invoice.invoiceNumber}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          title={`Invoice ${invoice.invoiceNumber}`}
          description={invoice.customer?.name ? `Bill to: ${invoice.customer.name}` : undefined}
          actions={
            <>
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.status === "draft" && (
                <Button
                  onClick={() => issueMutation.mutate()}
                  disabled={issueMutation.isPending}
                >
                  {issueMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Issue
                </Button>
              )}
              {canVoid && (
                <Button variant="destructive" onClick={() => setVoidDialogOpen(true)}>
                  <Ban className="mr-2 h-4 w-4" />
                  Void
                </Button>
              )}
              <Button variant="outline" onClick={copyPayLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Pay Link
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Show QR code">
                    <QrCode className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="flex flex-col items-center gap-2">
                    <QRCodeSVG value={`${window.location.origin}/pay/${invoice?.id ?? id}`} size={160} />
                    <p className="text-xs text-muted-foreground">Scan to pay</p>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                onClick={() => {
                  const url = `/api/admin/invoicing/invoices/${id}/preview${qs}`;
                  window.open(url, "_blank");
                }}
              >
                Print / Preview
              </Button>
              {invoice.customer?.email && invoice.status !== "draft" && (
                <Button
                  variant="outline"
                  onClick={() => sendEmailMutation.mutate()}
                  disabled={sendEmailMutation.isPending}
                >
                  {sendEmailMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Send to Customer
                </Button>
              )}
              <Button
                onClick={() => setRecordPaymentOpen(true)}
                disabled={!canRecordPayment || recordPaymentMutation.isPending}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            </>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <IndianRupee className="h-5 w-5" />
              Invoice preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Customer</p>
                {invoice.customer ? (
                  <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {invoice.customer.name}
                    </p>
                    {invoice.customer.email && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4 shrink-0" />
                        {invoice.customer.email}
                      </p>
                    )}
                    {invoice.customer.phone && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4 shrink-0" />
                        {invoice.customer.phone}
                      </p>
                    )}
                    {(invoice.customer.gstin || invoice.ext?.customerGstin) && (
                      <p className="text-xs text-muted-foreground">
                        GSTIN: <span className="font-mono">{invoice.customer.gstin || invoice.ext?.customerGstin}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No customer on file</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Dates</p>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Issue:</span>{" "}
                    {formatDisplayDate(invoice.issueDate)}
                  </p>
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Due:</span>{" "}
                    {formatDisplayDate(invoice.dueDate)}
                  </p>
                </div>
                {invoice.costCenterId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {detailCostCenterLabel}:{" "}
                    <span className="font-medium text-foreground">
                      {invoiceCostCenterName ?? invoice.costCenterId}
                    </span>
                  </p>
                )}
                {invoice.ext?.supplierGstin && (
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <p>
                      Supplier GSTIN: <span className="font-mono">{invoice.ext.supplierGstin}</span>
                    </p>
                    {invoice.ext.supplierGstinSource ? (
                      <p>Source: {supplierGstinSourceLabel(invoice.ext.supplierGstinSource)}</p>
                    ) : null}
                    {(invoice.ext.supplierGstinOverride || invoice.ext.supplierStateCodeOverride) && (
                      <p className="font-mono text-[11px]">
                        Overrides stored:{" "}
                        {[invoice.ext.supplierGstinOverride, invoice.ext.supplierStateCodeOverride]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {invoice.notes?.trim() && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="text-xs font-medium uppercase text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>HSN/SAC</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Tax %</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.description}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{line.ext?.hsnCode ?? "—"}</TableCell>
                      <TableCell className="text-right">{line.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInr(line.unitAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.taxRate}%</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatInr(line.lineTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col items-end gap-2 text-sm">
              <div className="flex w-full max-w-xs justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatInr(invoice.subtotal)}</span>
              </div>
              {invoice.ext?.taxBreakdown?.length ? (
                invoice.ext.taxBreakdown.map((tb, i) => (
                  <div key={i} className="flex w-full max-w-xs justify-between">
                    <span className="text-muted-foreground">{tb.label}</span>
                    <span className="tabular-nums">{formatInr(tb.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="flex w-full max-w-xs justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="tabular-nums">{formatInr(invoice.taxAmount)}</span>
                </div>
              )}
              <div className="flex w-full max-w-xs justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatInr(invoice.total)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between text-muted-foreground">
                <span>Amount paid</span>
                <span className="tabular-nums">{formatInr(invoice.amountPaid)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Payments</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Allocations and manual entries linked to this invoice.
              </p>
            </div>
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-right",
                remainingBalance > 0
                  ? "border-amber-400/60 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/30"
                  : "border-green-400/60 bg-green-50/80 dark:border-green-800 dark:bg-green-950/30",
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Remaining balance
              </p>
              <p className="text-2xl font-bold tabular-nums tracking-tight">{formatInr(remainingBalance)}</p>
            </div>
          </CardHeader>
          <CardContent>
            {!invoice.allocations?.length ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="space-y-4">
                {invoice.allocations.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-lg font-semibold tabular-nums">{formatInr(a.amount)}</p>
                      <p className="text-sm text-muted-foreground">
                        {[a.method, a.provider].filter(Boolean).join(" · ") || "Payment"}
                        {a.reference ? ` · Ref: ${a.reference}` : ""}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground sm:text-right">
                      <p>{formatDisplayDate(a.paymentDate)}</p>
                      <p className="text-xs">Logged {formatDisplayDate(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Only invoices with no payments can be voided.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                voidMutation.mutate();
              }}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Void invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Post a manual payment against invoice {invoice.invoiceNumber}. Remaining:{" "}
              {formatInr(remainingBalance)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pay-amount">Amount (₹)</Label>
              <Input
                id="pay-amount"
                type="number"
                min={1}
                step={1}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input
                id="pay-ref"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Cheque no., UPI ref, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => recordPaymentMutation.mutate()}
              disabled={recordPaymentMutation.isPending}
            >
              {recordPaymentMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
