import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Search, IndianRupee, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/ImageUploadField";
import type { RegistrationWithDetails, Student } from "@shared/schema";

interface DuplicatePaymentInfo {
  existingPayment: {
    id: string;
    amount: number;
    paymentDate: string;
    receiptNumber: string;
    paymentMethod: string;
  };
  canOverride: boolean;
}

export default function AdminPaymentRecord() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<RegistrationWithDetails | null>(null);
  const [showResults, setShowResults] = useState(false);
  
  // Form state
  const [paymentType, setPaymentType] = useState<"hostel_fee" | "remaining_fee">("hostel_fee");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "demand_draft" | "card_on_campus">("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [proofUrl, setProofUrl] = useState<string>("");
  const [notes, setNotes] = useState("");
  
  // Duplicate detection state
  const [duplicateDialog, setDuplicateDialog] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicatePaymentInfo | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const { data: registrations, isLoading: registrationsLoading } = useQuery<RegistrationWithDetails[]>({
    queryKey: ["/api/admin/registrations"],
  });

  const filteredStudents = registrations?.filter(reg => 
    searchQuery && (
      reg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reg.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reg.phone.includes(searchQuery)
    )
  ).slice(0, 10) || [];

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/manual-payments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      toast({ title: "Payment recorded successfully" });
      resetForm();
    },
    onError: (error: any) => {
      // Check for duplicate detection
      if (error.duplicateDetected && error.canOverride) {
        setDuplicateInfo({
          existingPayment: error.existingPayment,
          canOverride: error.canOverride,
        });
        setDuplicateDialog(true);
      } else {
        toast({ 
          title: "Error", 
          description: error.message || "Failed to record payment", 
          variant: "destructive" 
        });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStudent) {
      toast({ title: "Error", description: "Please select a student", variant: "destructive" });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }

    if (!receiptNumber.trim()) {
      toast({ title: "Error", description: "Please enter a receipt number", variant: "destructive" });
      return;
    }

    if (overrideDuplicate && !overrideReason.trim()) {
      toast({ title: "Error", description: "Please provide a reason for override", variant: "destructive" });
      return;
    }

    const data = {
      registrationId: selectedStudent.id,
      amount: Math.round(parseFloat(amount)), // Store in rupees (consistent with fee config and online payments)
      paymentType,
      paymentMethod,
      receiptNumber,
      paymentDate: format(paymentDate, "yyyy-MM-dd"),
      proofUrl: proofUrl || undefined,
      notes: notes || undefined,
      metadata: {
        studentId: selectedStudent.id,
        ...(paymentType === "hostel_fee" ? { year, month } : {}),
      },
      overrideDuplicate,
      overrideReason: overrideDuplicate ? overrideReason : undefined,
    };

    recordPaymentMutation.mutate(data);
  };

  const handleDuplicateOverride = () => {
    setOverrideDuplicate(true);
    setDuplicateDialog(false);
    // Trigger form submit again with override flag
    const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
    document.querySelector('form')?.dispatchEvent(submitEvent);
  };

  const resetForm = () => {
    setSelectedStudent(null);
    setSearchQuery("");
    setPaymentType("hostel_fee");
    setAmount("");
    setPaymentMethod("cash");
    setReceiptNumber("");
    setPaymentDate(new Date());
    setMonth(new Date().getMonth() + 1);
    setYear(new Date().getFullYear());
    setProofUrl("");
    setNotes("");
    setOverrideDuplicate(false);
    setOverrideReason("");
    setDuplicateInfo(null);
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Record Manual Payment</h1>
        <p className="text-muted-foreground">Record cash or offline payments for students</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {/* Student Search */}
        <Card>
          <CardHeader>
            <CardTitle>Select Student</CardTitle>
            <CardDescription>Search by name, email, or phone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                className="pl-9"
                data-testid="input-student-search"
              />
            </div>

            {showResults && searchQuery && filteredStudents.length > 0 && (
              <Card>
                <CardContent className="p-2 max-h-60 overflow-y-auto">
                  {filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudent(student);
                        setShowResults(false);
                        setSearchQuery("");
                      }}
                      className="w-full text-left px-4 py-3 hover-elevate active-elevate-2 rounded-md"
                      data-testid={`button-select-student-${student.id}`}
                    >
                      <div className="font-medium">{student.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {student.email} • {student.phone}
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {selectedStudent && (
              <Card className="bg-muted">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold" data-testid="text-selected-student-name">{selectedStudent.name}</div>
                      <div className="text-sm text-muted-foreground">{selectedStudent.email}</div>
                      <div className="text-sm text-muted-foreground">{selectedStudent.phone}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedStudent(null)}
                      data-testid="button-clear-student"
                    >
                      Change
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Payment Details */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentType">Payment Type</Label>
                <Select value={paymentType} onValueChange={(value: any) => setPaymentType(value)}>
                  <SelectTrigger data-testid="select-payment-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hostel_fee">Hostel Fee</SelectItem>
                    <SelectItem value="remaining_fee">Remaining Fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="5000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9"
                    required
                    data-testid="input-amount"
                  />
                </div>
              </div>
            </div>

            {paymentType === "hostel_fee" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="month">Month</Label>
                  <Select value={month.toString()} onValueChange={(value) => setMonth(parseInt(value))}>
                    <SelectTrigger data-testid="select-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={m.value.toString()}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Select value={year.toString()} onValueChange={(value) => setYear(parseInt(value))}>
                    <SelectTrigger data-testid="select-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="demand_draft">Demand Draft</SelectItem>
                    <SelectItem value="card_on_campus">Card on Campus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receiptNumber">Receipt Number</Label>
                <Input
                  id="receiptNumber"
                  placeholder="RCP001"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  required
                  data-testid="input-receipt-number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !paymentDate && "text-muted-foreground"
                    )}
                    data-testid="button-payment-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={(date) => date && setPaymentDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <ImageUploadField
              label="Payment Proof (Optional)"
              value={proofUrl}
              onChange={(assetId, url) => setProofUrl(url || "")}
              entityType="payment_proof"
              entityId={selectedStudent?.id}
            />

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this payment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                data-testid="input-notes"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button 
            type="submit" 
            disabled={!selectedStudent || recordPaymentMutation.isPending}
            data-testid="button-submit-payment"
          >
            {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={resetForm}
            data-testid="button-reset-form"
          >
            Reset
          </Button>
        </div>
      </form>

      {/* Duplicate Detection Dialog */}
      <AlertDialog open={duplicateDialog} onOpenChange={setDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Duplicate Payment Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              A similar payment already exists for this student:
            </AlertDialogDescription>
          </AlertDialogHeader>

          {duplicateInfo && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Amount:</div>
                    <div className="font-medium">₹{duplicateInfo.existingPayment.amount.toLocaleString('en-IN')}</div>
                    
                    <div className="text-muted-foreground">Date:</div>
                    <div className="font-medium">{duplicateInfo.existingPayment.paymentDate}</div>
                    
                    <div className="text-muted-foreground">Receipt:</div>
                    <div className="font-medium">{duplicateInfo.existingPayment.receiptNumber}</div>
                    
                    <div className="text-muted-foreground">Method:</div>
                    <div className="font-medium capitalize">{duplicateInfo.existingPayment.paymentMethod.replace(/_/g, ' ')}</div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="override"
                    checked={overrideDuplicate}
                    onCheckedChange={(checked) => setOverrideDuplicate(checked as boolean)}
                    data-testid="checkbox-override-duplicate"
                  />
                  <Label htmlFor="override" className="text-sm font-normal">
                    Override duplicate detection
                  </Label>
                </div>

                {overrideDuplicate && (
                  <div className="space-y-2">
                    <Label htmlFor="overrideReason">Reason for Override *</Label>
                    <Textarea
                      id="overrideReason"
                      placeholder="Explain why this is not a duplicate..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={3}
                      data-testid="input-override-reason"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-override">Cancel</AlertDialogCancel>
            <Button
              onClick={handleDuplicateOverride}
              disabled={overrideDuplicate && !overrideReason.trim()}
              data-testid="button-confirm-override"
            >
              {overrideDuplicate ? "Confirm Override" : "Review Payment"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
