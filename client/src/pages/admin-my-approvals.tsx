import { useState } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatIsoDate } from "@/lib/format-date";
import { QueryErrorState } from "@/components/query-error-state";
import { Check, IndianRupee, Loader2, X } from "lucide-react";

type PendingApproval = {
  expenseId: string;
  stepId: string;
  stepOrder: number;
  totalSteps: number;
  amount: number;
  vendorName: string | null;
  description: string | null;
  costCenterName: string | null;
  categoryName: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  expenseDate: string | null;
};

function formatInrFromPaise(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

const MY_APPROVALS_QUERY_KEY = "/api/admin/my-approvals";

export default function AdminMyApprovals() {
  const { toast } = useToast();
  const { user, hasExpenseAccess } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? urlTenantId || user?.tenantId || null : user?.tenantId ?? null;

  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const [rejectTarget, setRejectTarget] = useState<PendingApproval | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const {
    data: pending = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PendingApproval[]>({
    queryKey: [MY_APPROVALS_QUERY_KEY, tenantId],
    queryFn: async () => {
      const res = await fetch(`${MY_APPROVALS_QUERY_KEY}${qs}`, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load approvals");
      }
      return res.json();
    },
    enabled: !!tenantId && !!user && hasExpenseAccess,
  });

  const approveMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      await apiRequest("POST", `/api/admin/expenses/${expenseId}/approve`, { tenantId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MY_APPROVALS_QUERY_KEY, tenantId] });
      toast({ title: "Expense approved" });
    },
    onError: (e: Error) => {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ expenseId, reason }: { expenseId: string; reason: string }) => {
      await apiRequest("POST", `/api/admin/expenses/${expenseId}/reject`, { reason, tenantId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MY_APPROVALS_QUERY_KEY, tenantId] });
      toast({ title: "Expense rejected" });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (e: Error) => {
      toast({ title: "Rejection failed", description: e.message, variant: "destructive" });
    },
  });

  if (!tenantId) {
    return (
      <div className="w-full space-y-6 py-2">
        <PageHeader
          title="My Approvals"
          description="Expenses pending your approval"
        />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {isSuperAdmin
              ? "Select a tenant from the sidebar or add a tenantId query parameter."
              : "No tenant context."}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasExpenseAccess) {
    return (
      <div className="w-full space-y-6 py-2">
        <PageHeader
          title="My Approvals"
          description="Expenses pending your approval"
        />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You do not have access to this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 py-2">
      <PageHeader
        title="My Approvals"
        description="Expenses pending your approval"
      />

      {isError && (
        <QueryErrorState
          message={error instanceof Error ? error.message : "Something went wrong"}
          onRetry={() => void refetch()}
        />
      )}

      {!isError && isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading…</span>
        </div>
      )}

      {!isError && !isLoading && pending.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <IndianRupee className="h-10 w-10 opacity-40" />
            <p className="text-sm font-medium text-foreground">No pending approvals</p>
            <p className="max-w-sm text-sm">When expenses need your action, they will appear here.</p>
          </CardContent>
        </Card>
      )}

      {!isError && !isLoading && pending.length > 0 && (
        <ul className="space-y-4">
          {pending.map((item) => (
            <li key={item.stepId}>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="flex flex-wrap items-baseline gap-2 text-lg font-semibold">
                      <span className="tabular-nums">{formatInrFromPaise(item.amount)}</span>
                      <Badge variant="secondary" className="font-normal">
                        Step {item.stepOrder} of {item.totalSteps}
                      </Badge>
                    </CardTitle>
                    {item.vendorName && (
                      <p className="text-sm font-medium text-foreground">{item.vendorName}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onClick={() => approveMutation.mutate(item.expenseId)}
                    >
                      {approveMutation.isPending && approveMutation.variables === item.expenseId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span className="ml-1.5">Approve</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectReason("");
                      }}
                    >
                      <X className="h-4 w-4" />
                      <span className="ml-1.5">Reject</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {item.categoryName && (
                      <span>
                        <span className="text-foreground/80">Category:</span> {item.categoryName}
                      </span>
                    )}
                    {item.costCenterName && (
                      <span>
                        <span className="text-foreground/80">Cost center:</span> {item.costCenterName}
                      </span>
                    )}
                  </div>
                  {item.description && <p className="text-foreground/90">{item.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
                    <span>
                      <span className="text-foreground/80">Submitted by:</span>{" "}
                      {item.submittedByName ?? "—"}
                    </span>
                    <span>
                      <span className="text-foreground/80">Submitted:</span>{" "}
                      {formatIsoDate(item.submittedAt, "dd MMM yyyy, h:mm a", "—")}
                    </span>
                    {item.expenseDate != null && item.expenseDate !== "" && (
                      <span>
                        <span className="text-foreground/80">Expense date:</span>{" "}
                        {formatIsoDate(item.expenseDate, "dd MMM yyyy", "—")}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this expense is being rejected"
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              onClick={() => {
                if (!rejectTarget) return;
                rejectMutation.mutate({
                  expenseId: rejectTarget.expenseId,
                  reason: rejectReason.trim(),
                });
              }}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm reject"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
