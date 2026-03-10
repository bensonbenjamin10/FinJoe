import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronRight, CheckCircle, XCircle, Eye, IndianRupee } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Payment, Student, Registration } from "@shared/schema";

interface PendingPayment extends Payment {
  notes?: string | null;
  student?: Student;
  registration?: Registration;
  recordedByStudent?: Student;
}

export default function AdminPaymentVerify() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: "approve" | "reject" | null;
    payment: PendingPayment | null;
  }>({ open: false, action: null, payment: null });
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [proofDialog, setProofDialog] = useState<{ open: boolean; url: string | null }>({ 
    open: false, 
    url: null 
  });

  const { data: pendingPayments, isLoading } = useQuery<PendingPayment[]>({
    queryKey: ["/api/admin/payments/pending-verifications"],
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return await apiRequest("POST", `/api/admin/payments/${id}/verify`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments/pending-verifications"] });
      toast({ title: "Payment approved successfully" });
      setActionDialog({ open: false, action: null, payment: null });
      setNotes("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to approve payment", 
        variant: "destructive" 
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason, notes }: { id: string; reason: string; notes?: string }) => {
      return await apiRequest("POST", `/api/admin/payments/${id}/reject`, { reason, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments/pending-verifications"] });
      toast({ title: "Payment rejected" });
      setActionDialog({ open: false, action: null, payment: null });
      setRejectionReason("");
      setNotes("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reject payment", 
        variant: "destructive" 
      });
    },
  });

  const filteredPayments = pendingPayments?.filter((payment) => {
    const matchesType = filterType === "all" || payment.paymentType === filterType;
    const matchesSearch = !searchQuery || 
      payment.registration?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.registration?.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  }) || [];

  const handleApprove = (payment: PendingPayment) => {
    setActionDialog({ open: true, action: "approve", payment });
  };

  const handleReject = (payment: PendingPayment) => {
    setActionDialog({ open: true, action: "reject", payment });
  };

  const confirmAction = () => {
    if (!actionDialog.payment) return;

    if (actionDialog.action === "approve") {
      verifyMutation.mutate({ 
        id: actionDialog.payment.id, 
        notes: notes || undefined 
      });
    } else if (actionDialog.action === "reject") {
      if (!rejectionReason.trim()) {
        toast({ 
          title: "Error", 
          description: "Rejection reason is required", 
          variant: "destructive" 
        });
        return;
      }
      rejectMutation.mutate({ 
        id: actionDialog.payment.id, 
        reason: rejectionReason, 
        notes: notes || undefined 
      });
    }
  };

  const formatPaymentType = (type: string) => {
    return type.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatPaymentMethod = (method: string) => {
    return method.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Payment Verification Queue</h1>
        <p className="text-muted-foreground">Review and verify manually recorded payments</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by student name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-student"
              />
            </div>

            <div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="select-filter-type">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="hostel_fee">Hostel Fee</SelectItem>
                  <SelectItem value="remaining_fee">Remaining Fee</SelectItem>
                  <SelectItem value="registration_fee">Registration Fee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Loading pending payments...</p>
          </CardContent>
        </Card>
      ) : filteredPayments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No pending verifications</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table data-testid="table-pending-payments">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Receipt#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <>
                      <TableRow 
                        key={payment.id}
                        className="hover-elevate"
                        data-testid={`row-payment-${payment.id}`}
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setExpandedRow(expandedRow === payment.id ? null : payment.id)}
                            data-testid={`button-expand-${payment.id}`}
                          >
                            {expandedRow === payment.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{payment.registration?.name || "N/A"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{payment.registration?.email}</div>
                          <div className="text-sm text-muted-foreground">{payment.registration?.phone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">₹{payment.amount.toLocaleString('en-IN')}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatPaymentType(payment.paymentType)}</Badge>
                        </TableCell>
                        <TableCell className="capitalize">
                          {formatPaymentMethod(payment.paymentMethod || "online")}
                        </TableCell>
                        <TableCell>{payment.receiptNumber || "N/A"}</TableCell>
                        <TableCell>
                          {payment.createdAt ? format(new Date(payment.createdAt), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell>{payment.recordedByStudent?.name || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleApprove(payment)}
                              data-testid={`button-approve-${payment.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(payment)}
                              data-testid={`button-reject-${payment.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expandable Row Details */}
                      {expandedRow === payment.id && (
                        <TableRow data-testid={`row-details-${payment.id}`}>
                          <TableCell colSpan={10}>
                            <Card className="m-4">
                              <CardHeader>
                                <CardTitle>Payment Details</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-muted-foreground">Description</Label>
                                    <p>{payment.description || "No description"}</p>
                                  </div>

                                  <div>
                                    <Label className="text-muted-foreground">Currency</Label>
                                    <p>{payment.currency}</p>
                                  </div>

                                  {payment.metadata != null && (
                                    <div className="md:col-span-2">
                                      <Label className="text-muted-foreground">Metadata</Label>
                                      <pre className="mt-2 p-3 bg-muted rounded-md text-sm overflow-x-auto">
                                        {JSON.stringify(payment.metadata as object, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {payment.proofUrl && (
                                    <div className="md:col-span-2">
                                      <Label className="text-muted-foreground">Payment Proof</Label>
                                      <div className="mt-2">
                                        <Button
                                          variant="outline"
                                          onClick={() => setProofDialog({ open: true, url: payment.proofUrl })}
                                          data-testid={`button-view-proof-${payment.id}`}
                                        >
                                          <Eye className="h-4 w-4 mr-2" />
                                          View Proof
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {payment.notes && (
                                    <div className="md:col-span-2">
                                      <Label className="text-muted-foreground">Cashier Notes</Label>
                                      <p className="mt-2 p-3 bg-muted rounded-md">{payment.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => {
        if (!open) {
          setActionDialog({ open: false, action: null, payment: null });
          setNotes("");
          setRejectionReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "approve" ? "Approve Payment" : "Reject Payment"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.payment && (
                <div className="mt-2">
                  <p><strong>Student:</strong> {actionDialog.payment.registration?.name}</p>
                  <p><strong>Amount:</strong> ₹{actionDialog.payment.amount.toLocaleString('en-IN')}</p>
                  <p><strong>Type:</strong> {formatPaymentType(actionDialog.payment.paymentType)}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {actionDialog.action === "reject" && (
              <div className="space-y-2">
                <Label htmlFor="rejectionReason">Rejection Reason *</Label>
                <Textarea
                  id="rejectionReason"
                  placeholder="Explain why this payment is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  data-testid="input-rejection-reason"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">
                {actionDialog.action === "approve" ? "Notes (Optional)" : "Additional Notes (Optional)"}
              </Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                data-testid="input-verification-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog({ open: false, action: null, payment: null });
                setNotes("");
                setRejectionReason("");
              }}
              data-testid="button-cancel-action"
            >
              Cancel
            </Button>
            <Button
              variant={actionDialog.action === "approve" ? "default" : "destructive"}
              onClick={confirmAction}
              disabled={
                (actionDialog.action === "reject" && !rejectionReason.trim()) ||
                verifyMutation.isPending ||
                rejectMutation.isPending
              }
              data-testid="button-confirm-action"
            >
              {verifyMutation.isPending || rejectMutation.isPending
                ? "Processing..."
                : actionDialog.action === "approve"
                ? "Approve"
                : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof Image Dialog */}
      <Dialog open={proofDialog.open} onOpenChange={(open) => setProofDialog({ open, url: null })}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {proofDialog.url && (
            <div className="mt-4">
              <img 
                src={proofDialog.url} 
                alt="Payment proof" 
                className="w-full rounded-md"
                data-testid="img-payment-proof"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
