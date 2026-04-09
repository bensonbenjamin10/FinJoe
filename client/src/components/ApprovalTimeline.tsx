import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, X, SkipForward, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ApprovalStep = {
  id: string;
  stepOrder: number;
  status: string;
  approverType: string;
  approverValue: string | null;
  approvalMode: string;
  assignedTo: string[];
  actedById: string | null;
  actedByName: string | null;
  actedAt: string | null;
  comment: string | null;
};

type ApprovalStatusData = {
  ruleId: string;
  ruleName: string;
  steps: ApprovalStep[];
  currentStepOrder: number | null;
  isFullyApproved: boolean;
  isRejected: boolean;
};

const STEP_STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  approved: { icon: Check, color: "text-green-600", label: "Approved" },
  rejected: { icon: X, color: "text-red-600", label: "Rejected" },
  pending: { icon: Clock, color: "text-amber-600", label: "Pending" },
  waiting: { icon: Clock, color: "text-muted-foreground", label: "Waiting" },
  skipped: { icon: SkipForward, color: "text-muted-foreground", label: "Skipped" },
};

function formatApproverType(type: string, value: string | null): string {
  switch (type) {
    case "role":
      return value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Any role";
    case "user":
      return "Specific user";
    case "cost_center_head":
      return "Cost center head";
    case "category_owner":
      return "Category owner";
    default:
      return type;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function ApprovalTimeline({
  expenseId,
  tenantId,
}: {
  expenseId: string;
  tenantId: string | null;
}) {
  const queryKey = tenantId
    ? [`/api/admin/expenses/${expenseId}/approval-history`, tenantId]
    : [`/api/admin/expenses/${expenseId}/approval-history`];

  const { data, isLoading } = useQuery<ApprovalStatusData>({
    queryKey,
    queryFn: async () => {
      const url = tenantId
        ? `/api/admin/expenses/${expenseId}/approval-history?tenantId=${encodeURIComponent(tenantId)}`
        : `/api/admin/expenses/${expenseId}/approval-history`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!expenseId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading approval history...
      </div>
    );
  }

  if (!data || !data.steps || data.steps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold">Approval workflow</h4>
        <Badge variant="outline" className="text-xs">
          {data.ruleName}
        </Badge>
      </div>

      <div className="relative ml-3 border-l-2 border-muted pl-6 space-y-4">
        {data.steps.map((step) => {
          const config = STEP_STATUS_CONFIG[step.status] ?? STEP_STATUS_CONFIG.waiting;
          const Icon = config.icon;
          const isCurrent = step.stepOrder === data.currentStepOrder;

          return (
            <div key={step.id} className="relative">
              <div
                className={cn(
                  "absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border-2 bg-background",
                  step.status === "approved" && "border-green-600",
                  step.status === "rejected" && "border-red-600",
                  step.status === "pending" && "border-amber-600",
                  (step.status === "waiting" || step.status === "skipped") && "border-muted-foreground"
                )}
              >
                <Icon className={cn("h-3 w-3", config.color)} />
              </div>

              <div className={cn("space-y-0.5", isCurrent && "font-medium")}>
                <div className="flex items-center gap-2 text-sm">
                  <span>
                    Step {step.stepOrder}: {formatApproverType(step.approverType, step.approverValue)}
                  </span>
                  <Badge
                    variant={
                      step.status === "approved"
                        ? "default"
                        : step.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-xs"
                  >
                    {config.label}
                  </Badge>
                </div>

                {step.actedByName && (
                  <p className="text-xs text-muted-foreground">
                    {step.status === "approved" ? "Approved" : "Rejected"} by{" "}
                    {step.actedByName}
                    {step.actedAt && ` on ${formatDate(step.actedAt)}`}
                  </p>
                )}

                {step.comment && (
                  <p className="text-xs text-muted-foreground italic">
                    &quot;{step.comment}&quot;
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
