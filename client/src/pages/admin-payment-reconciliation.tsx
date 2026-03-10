import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Download, Filter, Eye, IndianRupee, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Payment, Student, Registration, PaymentAuditLog } from "@shared/schema";

interface PaymentWithDetails extends Payment {
  student?: Student;
  registration?: Registration;
  verifiedByStudent?: Student;
}

interface ReconciliationResponse {
  payments: PaymentWithDetails[];
  summary: {
    totalCount: number;
    totalAmount: number;
    pendingCount: number;
    confirmedCount: number;
    rejectedCount: number;
  };
}

export default function AdminPaymentReconciliation() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<string>("all");
  const [auditDialog, setAuditDialog] = useState<{ open: boolean; paymentId: string | null }>({ 
    open: false, 
    paymentId: null 
  });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", format(startDate, "yyyy-MM-dd"));
    if (endDate) params.append("endDate", format(endDate, "yyyy-MM-dd"));
    if (selectedMethods.length > 0) params.append("paymentMethod", selectedMethods.join(","));
    if (verificationStatus !== "all") params.append("verificationStatus", verificationStatus);
    return params.toString();
  };

  const { data, isLoading, refetch } = useQuery<ReconciliationResponse>({
    queryKey: ["/api/admin/payments/reconciliation", buildQueryParams()],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/admin/payments/reconciliation?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reconciliation data");
      return response.json();
    },
  });

  const { data: auditLogs } = useQuery<PaymentAuditLog[]>({
    queryKey: ["/api/admin/payments/audit-logs", auditDialog.paymentId],
    enabled: !!auditDialog.paymentId,
    queryFn: async () => {
      const response = await fetch(`/api/admin/payments/${auditDialog.paymentId}/audit-logs`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch audit logs");
      return response.json();
    },
  });

  const handleApplyFilters = () => {
    refetch();
  };

  const handleResetFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectedMethods([]);
    setVerificationStatus("all");
  };

  const handleExportCSV = () => {
    if (!data?.payments || data.payments.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = ["Date", "Student", "Email", "Type", "Method", "Amount", "Status", "Receipt#", "Verified By"];
    const rows = data.payments.map(payment => [
      payment.createdAt ? format(new Date(payment.createdAt), "yyyy-MM-dd") : "",
      payment.registration?.name || "",
      payment.registration?.email || "",
      payment.paymentType,
      payment.paymentMethod || "online",
      payment.amount.toLocaleString('en-IN'),
      payment.verificationStatus || payment.status,
      payment.receiptNumber || "",
      payment.verifiedByStudent?.name || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-reconciliation-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({ title: "CSV exported successfully" });
  };

  const togglePaymentMethod = (method: string) => {
    setSelectedMethods(prev => 
      prev.includes(method) 
        ? prev.filter(m => m !== method)
        : [...prev, method]
    );
  };

  const getStatusBadge = (payment: PaymentWithDetails) => {
    const status = payment.verificationStatus || payment.status;
    
    if (status === "confirmed") {
      return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmed</Badge>;
    } else if (status === "pending_verification") {
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    } else if (status === "rejected") {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    }
    
    return <Badge variant="outline">{status}</Badge>;
  };

  const paymentMethods = ["cash", "bank_transfer", "demand_draft", "card_on_campus", "online"];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Payment Reconciliation</h1>
        <p className="text-muted-foreground">View and export payment records with filters</p>
      </div>

      {/* Filters Panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Start Date */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                    data-testid="button-start-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                    data-testid="button-end-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Verification Status */}
            <div className="space-y-2">
              <Label>Verification Status</Label>
              <Select value={verificationStatus} onValueChange={setVerificationStatus}>
                <SelectTrigger data-testid="select-verification-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending_verification">Pending Verification</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-2">
            <Label>Payment Methods</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {paymentMethods.map((method) => (
                <div key={method} className="flex items-center space-x-2">
                  <Checkbox
                    id={`method-${method}`}
                    checked={selectedMethods.includes(method)}
                    onCheckedChange={() => togglePaymentMethod(method)}
                    data-testid={`checkbox-method-${method}`}
                  />
                  <Label 
                    htmlFor={`method-${method}`} 
                    className="text-sm font-normal capitalize cursor-pointer"
                  >
                    {method.replace(/_/g, ' ')}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={handleApplyFilters} data-testid="button-apply-filters">
              Apply Filters
            </Button>
            <Button variant="outline" onClick={handleResetFilters} data-testid="button-reset-filters">
              Reset
            </Button>
            <Button 
              variant="outline" 
              onClick={handleExportCSV}
              disabled={!data?.payments || data.payments.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-count">
                {data.summary.totalCount}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center" data-testid="text-total-amount">
                <IndianRupee className="h-5 w-5 mr-1" />
                {data.summary.totalAmount.toLocaleString('en-IN')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Verifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">
                {data.summary.pendingCount}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Confirmed Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-confirmed-count">
                {data.summary.confirmedCount}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payments Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Loading payments...</p>
          </CardContent>
        </Card>
      ) : !data?.payments || data.payments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No payments found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table data-testid="table-reconciliation">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Receipt#</TableHead>
                    <TableHead>Verified By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((payment) => (
                    <TableRow 
                      key={payment.id}
                      className="hover-elevate"
                      data-testid={`row-payment-${payment.id}`}
                    >
                      <TableCell>
                        {payment.createdAt ? format(new Date(payment.createdAt), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{payment.registration?.name || "N/A"}</div>
                        <div className="text-sm text-muted-foreground">{payment.registration?.email}</div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentType.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="capitalize">
                        {(payment.paymentMethod || "online").replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">₹{payment.amount.toLocaleString('en-IN')}</div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(payment)}
                      </TableCell>
                      <TableCell>{payment.receiptNumber || "N/A"}</TableCell>
                      <TableCell>{payment.verifiedByStudent?.name || "N/A"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAuditDialog({ open: true, paymentId: payment.id })}
                            data-testid={`button-view-audit-${payment.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Audit Log
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Log Dialog */}
      <Dialog 
        open={auditDialog.open} 
        onOpenChange={(open) => setAuditDialog({ open, paymentId: null })}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Payment Audit Log
            </DialogTitle>
          </DialogHeader>

          {auditLogs && auditLogs.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {auditLogs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <Badge>{log.action}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {log.createdAt ? format(new Date(log.createdAt), "PPP p") : "N/A"}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-sm mt-2">{log.notes}</p>
                    )}
                    {((log.previousValues != null) || (log.newValues != null)) && (
                      <div className="mt-3 space-y-2">
                        {log.previousValues != null && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Previous:</Label>
                            <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                              {JSON.stringify(log.previousValues, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.newValues != null && (
                          <div>
                            <Label className="text-xs text-muted-foreground">New:</Label>
                            <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                              {JSON.stringify(log.newValues, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No audit logs available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
