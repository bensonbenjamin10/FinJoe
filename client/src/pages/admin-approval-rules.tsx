import { useMemo, useState } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { ApprovalRule, ApprovalRuleStep } from "@shared/schema";

type RuleWithSteps = ApprovalRule & { steps: ApprovalRuleStep[] };

type ConditionField = "amount" | "category_id" | "cost_center_id" | "vendor_id" | "source";
type ConditionOp = "eq" | "neq" | "in" | "not_in" | "gte" | "lte" | "between";
type ApproverType = "role" | "user" | "cost_center_head" | "category_owner";
type ApprovalMode = "any_one" | "all";

type ConditionFormRow = {
  key: string;
  field: ConditionField;
  op: ConditionOp;
  valueText: string;
  valueText2: string;
};

type StepFormRow = {
  key: string;
  approverType: ApproverType;
  approverValue: string;
  approvalMode: ApprovalMode;
};

const CONDITION_FIELDS: { value: ConditionField; label: string }[] = [
  { value: "amount", label: "Amount" },
  { value: "category_id", label: "Category" },
  { value: "cost_center_id", label: "Cost center" },
  { value: "vendor_id", label: "Vendor" },
  { value: "source", label: "Source" },
];

const CONDITION_OPS: { value: ConditionOp; label: string }[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "in", label: "In" },
  { value: "not_in", label: "Not in" },
  { value: "gte", label: "Greater or equal" },
  { value: "lte", label: "Less or equal" },
  { value: "between", label: "Between" },
];

const APPROVER_TYPES: { value: ApproverType; label: string }[] = [
  { value: "role", label: "Role" },
  { value: "user", label: "User" },
  { value: "cost_center_head", label: "Cost center head" },
  { value: "category_owner", label: "Category owner" },
];

const APPROVAL_MODES: { value: ApprovalMode; label: string }[] = [
  { value: "any_one", label: "Any one" },
  { value: "all", label: "All" },
];

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function conditionToFormRow(c: { field: string; op: string; value: unknown }): ConditionFormRow {
  const field = (CONDITION_FIELDS.some((f) => f.value === c.field) ? c.field : "amount") as ConditionField;
  const op = (CONDITION_OPS.some((o) => o.value === c.op) ? c.op : "eq") as ConditionOp;
  if (op === "between" && Array.isArray(c.value) && c.value.length >= 2) {
    return {
      key: newKey(),
      field,
      op,
      valueText: String(c.value[0]),
      valueText2: String(c.value[1]),
    };
  }
  if ((op === "in" || op === "not_in") && Array.isArray(c.value)) {
    return {
      key: newKey(),
      field,
      op,
      valueText: (c.value as unknown[]).map(String).join(", "),
      valueText2: "",
    };
  }
  return {
    key: newKey(),
    field,
    op,
    valueText: c.value === undefined || c.value === null ? "" : String(c.value),
    valueText2: "",
  };
}

function stepToFormRow(s: ApprovalRuleStep): StepFormRow {
  const t = (APPROVER_TYPES.some((x) => x.value === s.approverType) ? s.approverType : "role") as ApproverType;
  const m = (APPROVAL_MODES.some((x) => x.value === s.approvalMode) ? s.approvalMode : "any_one") as ApprovalMode;
  return {
    key: s.id || newKey(),
    approverType: t,
    approverValue: s.approverValue ?? "",
    approvalMode: m,
  };
}

function buildConditionPayload(row: ConditionFormRow): { field: string; op: string; value: unknown } | null {
  const { field, op, valueText, valueText2 } = row;
  if (op === "between") {
    if (field === "amount") {
      const a = Number(valueText);
      const b = Number(valueText2);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      return { field, op, value: [a, b] };
    }
    if (!valueText.trim() || !valueText2.trim()) return null;
    return { field, op, value: [valueText.trim(), valueText2.trim()] };
  }
  if (op === "in" || op === "not_in") {
    const parts = valueText.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    if (field === "amount") {
      const nums = parts.map(Number);
      if (nums.some((n) => Number.isNaN(n))) return null;
      return { field, op, value: nums };
    }
    return { field, op, value: parts };
  }
  if (field === "amount") {
    const n = Number(valueText);
    if (Number.isNaN(n)) return null;
    return { field, op, value: n };
  }
  if (!valueText.trim()) return null;
  return { field, op, value: valueText.trim() };
}

function summarizeConditions(conditions: ApprovalRule["conditions"]): string {
  const list = conditions ?? [];
  if (list.length === 0) return "Always matches";
  return list
    .map((c) => {
      const v =
        Array.isArray(c.value) && c.value.length > 4
          ? `[${c.value.length} items]`
          : JSON.stringify(c.value);
      return `${c.field} ${c.op} ${v}`;
    })
    .join(" · ");
}

function defaultConditionRow(): ConditionFormRow {
  return { key: newKey(), field: "amount", op: "gte", valueText: "", valueText2: "" };
}

function defaultStepRow(): StepFormRow {
  return { key: newKey(), approverType: "role", approverValue: "finance", approvalMode: "any_one" };
}

type AdminApprovalRulesProps = {
  tenantId?: string | null;
};

export default function AdminApprovalRules({ tenantId: tenantIdProp }: AdminApprovalRulesProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");

  const tenantId = useMemo(() => {
    if (tenantIdProp) return tenantIdProp;
    if (isSuperAdmin) return urlTenantId || user?.tenantId || null;
    return user?.tenantId ?? null;
  }, [tenantIdProp, isSuperAdmin, urlTenantId, user?.tenantId]);

  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleWithSteps | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RuleWithSteps | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState("10");
  const [conditions, setConditions] = useState<ConditionFormRow[]>([]);
  const [steps, setSteps] = useState<StepFormRow[]>([defaultStepRow()]);

  const openCreate = () => {
    setEditingRule(null);
    setName("");
    setPriority("10");
    setConditions([]);
    setSteps([defaultStepRow()]);
    setBuilderOpen(true);
  };

  const openEdit = (rule: RuleWithSteps) => {
    setEditingRule(rule);
    setName(rule.name);
    setPriority(String(rule.priority));
    setConditions((rule.conditions ?? []).map(conditionToFormRow));
    setSteps(rule.steps.length ? rule.steps.map(stepToFormRow) : [defaultStepRow()]);
    setBuilderOpen(true);
  };

  const { data: rules = [], isLoading } = useQuery<RuleWithSteps[]>({
    queryKey: ["/api/admin/approval-rules", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/approval-rules${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/approval-rules"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const p = Number(priority);
      if (!name.trim()) throw new Error("Name is required");
      if (Number.isNaN(p)) throw new Error("Priority must be a number");
      const built: Array<{ field: string; op: string; value: unknown }> = [];
      for (const row of conditions) {
        const c = buildConditionPayload(row);
        if (!c) {
          throw new Error("Each condition needs valid values");
        }
        built.push(c);
      }
      if (steps.length === 0) throw new Error("At least one step is required");
      for (const s of steps) {
        if ((s.approverType === "role" || s.approverType === "user") && !s.approverValue.trim()) {
          throw new Error("Approver value is required for role and user steps");
        }
      }
      const stepsPayload = steps.map((s) => ({
        approverType: s.approverType,
        approverValue:
          s.approverType === "role" || s.approverType === "user" ? s.approverValue.trim() : null,
        approvalMode: s.approvalMode,
        canReject: true,
      }));
      const body = {
        ...(isSuperAdmin && tenantId ? { tenantId } : {}),
        name: name.trim(),
        priority: p,
        conditions: built,
        steps: stepsPayload,
      };
      if (editingRule) {
        await apiRequest("PUT", `/api/admin/approval-rules/${editingRule.id}${qs}`, body);
      } else {
        await apiRequest("POST", `/api/admin/approval-rules${qs}`, body);
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: editingRule ? "Rule updated" : "Rule created" });
      setBuilderOpen(false);
      setEditingRule(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (rule: RuleWithSteps) => {
      await apiRequest("DELETE", `/api/admin/approval-rules/${rule.id}${qs}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Rule deleted" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PUT", `/api/admin/approval-rules/${id}${qs}`, {
        ...(isSuperAdmin && tenantId ? { tenantId } : {}),
        isActive,
      });
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const numericField = (f: ConditionField) => f === "amount";

  const showSecondValue = (row: ConditionFormRow) => row.op === "between";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <CardTitle>Approval rules</CardTitle>
          <Button onClick={openCreate} disabled={!tenantId}>
            <Plus className="mr-2 h-4 w-4" />
            New rule
          </Button>
        </CardHeader>
        <CardContent>
          {!tenantId && (
            <p className="text-muted-foreground text-sm">
              Select a tenant (super admin) or sign in with a tenant account to manage rules.
            </p>
          )}
          {tenantId && isLoading && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading rules
            </div>
          )}
          {tenantId && !isLoading && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[90px]">Priority</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead className="w-[80px]">Steps</TableHead>
                    <TableHead className="w-[100px]">Active</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground text-center text-sm">
                        No rules yet. Create one or submit an expense to generate the default rule.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            {rule.name}
                            {rule.isDefault && (
                              <Badge variant="secondary">Default</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{rule.priority}</TableCell>
                        <TableCell className="max-w-[320px] truncate text-sm">
                          {summarizeConditions(rule.conditions)}
                        </TableCell>
                        <TableCell>{rule.steps?.length ?? 0}</TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.isActive}
                            disabled={toggleActiveMutation.isPending}
                            onCheckedChange={(v) =>
                              toggleActiveMutation.mutate({ id: rule.id, isActive: v })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Edit rule"
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Delete rule"
                              disabled={rule.isDefault}
                              onClick={() => setDeleteTarget(rule)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open);
          if (!open) setEditingRule(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit approval rule" : "New approval rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rule name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">Higher numbers are evaluated before lower ones.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConditions((c) => [...c, defaultConditionRow()])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add condition
                </Button>
              </div>
              {conditions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No conditions — rule matches all expenses.</p>
              ) : (
                <div className="space-y-3">
                  {conditions.map((row, idx) => (
                    <div
                      key={row.key}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:flex-wrap sm:items-end"
                    >
                      <div className="space-y-1 sm:w-[140px]">
                        <Label className="text-xs">Field</Label>
                        <Select
                          value={row.field}
                          onValueChange={(v) =>
                            setConditions((list) =>
                              list.map((r, i) =>
                                i === idx ? { ...r, field: v as ConditionField } : r
                              )
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 sm:w-[160px]">
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={row.op}
                          onValueChange={(v) =>
                            setConditions((list) =>
                              list.map((r, i) => (i === idx ? { ...r, op: v as ConditionOp } : r))
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-xs">
                          {showSecondValue(row) ? "From / min" : "Value"}
                        </Label>
                        <Input
                          type={numericField(row.field) && row.op !== "in" && row.op !== "not_in" ? "number" : "text"}
                          value={row.valueText}
                          onChange={(e) =>
                            setConditions((list) =>
                              list.map((r, i) => (i === idx ? { ...r, valueText: e.target.value } : r))
                            )
                          }
                          placeholder={
                            row.op === "in" || row.op === "not_in"
                              ? "Comma-separated values"
                              : undefined
                          }
                        />
                      </div>
                      {showSecondValue(row) && (
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label className="text-xs">To / max</Label>
                          <Input
                            type={numericField(row.field) ? "number" : "text"}
                            value={row.valueText2}
                            onChange={(e) =>
                              setConditions((list) =>
                                list.map((r, i) => (i === idx ? { ...r, valueText2: e.target.value } : r))
                              )
                            }
                          />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setConditions((list) => list.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSteps((s) => [...s, defaultStepRow()])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add step
                </Button>
              </div>
              <div className="space-y-3">
                {steps.map((row, idx) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:flex-wrap sm:items-end"
                  >
                    <div className="text-muted-foreground w-8 pt-2 text-sm font-medium">{idx + 1}.</div>
                    <div className="space-y-1 sm:w-[180px]">
                      <Label className="text-xs">Approver type</Label>
                      <Select
                        value={row.approverType}
                        onValueChange={(v) =>
                          setSteps((list) =>
                            list.map((r, i) =>
                              i === idx ? { ...r, approverType: v as ApproverType } : r
                            )
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPROVER_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(row.approverType === "role" || row.approverType === "user") && (
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label className="text-xs">
                          {row.approverType === "role" ? "Role name" : "User ID"}
                        </Label>
                        <Input
                          value={row.approverValue}
                          onChange={(e) =>
                            setSteps((list) =>
                              list.map((r, i) =>
                                i === idx ? { ...r, approverValue: e.target.value } : r
                              )
                            )
                          }
                          placeholder={row.approverType === "role" ? "e.g. finance" : "User UUID"}
                        />
                      </div>
                    )}
                    <div className="space-y-1 sm:w-[140px]">
                      <Label className="text-xs">Approval mode</Label>
                      <Select
                        value={row.approvalMode}
                        onValueChange={(v) =>
                          setSteps((list) =>
                            list.map((r, i) =>
                              i === idx ? { ...r, approvalMode: v as ApprovalMode } : r
                            )
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPROVAL_MODES.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={steps.length <= 1}
                      onClick={() => setSteps((list) => list.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRule ? "Save changes" : "Create rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete rule</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
