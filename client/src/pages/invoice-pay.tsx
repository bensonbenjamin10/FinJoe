import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IndianRupee, Calendar, User, Loader2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

type PayInfo = {
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  remaining: number;
  currency: string;
  dueDate: string | null;
  customerName: string | null;
  gatewayConfigured: boolean;
};

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoicePay() {
  const { invoiceId } = useParams() as { invoiceId: string };
  const [, setLocation] = useLocation();
  const [orderCreating, setOrderCreating] = useState(false);

  const { data: info, isLoading, isError, error } = useQuery<PayInfo>({
    queryKey: ["invoice-pay-info", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/pay-info`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load invoice");
      }
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      setOrderCreating(true);
      const res = await fetch(`/api/invoices/${invoiceId}/create-order`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create payment order");
      }
      return res.json() as Promise<{ orderId: string }>;
    },
    onSuccess: (data) => {
      setLocation(`/payment-checkout?orderId=${data.orderId}`);
    },
    onError: () => {
      setOrderCreating(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !info) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Cannot process payment</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Something went wrong."}
                <br />
                <span className="mt-2 block text-xs">
                  If you believe this is an error, please contact the organization that sent you this link.
                </span>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dueLabel = info.dueDate
    ? (() => {
        try {
          return format(parseISO(info.dueDate), "dd MMM yyyy");
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Invoice {info.invoiceNumber}</CardTitle>
          {info.customerName && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              {info.customerName}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice total</span>
              <span className="font-medium tabular-nums">{formatInr(info.total)}</span>
            </div>
            {info.amountPaid > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already paid</span>
                <span className="tabular-nums">{formatInr(info.amountPaid)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>Amount due</span>
              <span className="flex items-center gap-1 tabular-nums">
                <IndianRupee className="h-4 w-4" />
                {info.remaining.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {dueLabel && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Due by {dueLabel}
              </div>
            )}
          </div>

          {info.gatewayConfigured ? (
            <Button
              className="w-full"
              size="lg"
              disabled={orderCreating || createOrderMutation.isPending}
              onClick={() => createOrderMutation.mutate()}
            >
              {orderCreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Pay {formatInr(info.remaining)}
            </Button>
          ) : (
            <Alert>
              <AlertTitle>Online payment unavailable</AlertTitle>
              <AlertDescription>
                The payment gateway is not configured. Please contact the organization for alternative payment methods.
              </AlertDescription>
            </Alert>
          )}

          {createOrderMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {createOrderMutation.error instanceof Error
                  ? createOrderMutation.error.message
                  : "Failed to initiate payment"}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
