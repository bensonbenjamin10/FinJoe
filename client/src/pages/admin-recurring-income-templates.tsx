import { useState } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Repeat,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import type { IncomeCategory, Campus } from "@shared/schema";

type RecurringIncomeTemplate = {
  id: string;
  costCenterId: string | null;
  categoryId: string;
  amount: number;
  particulars: string | null;
  incomeType: string;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  nextRunDate: string;
  costCenterName: string | null;
  categoryName: string | null;
  campusName?: string | null;
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  quarterly: "Quarterly",
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format nextRunDate for display; handles raw days-since-2000 number from API */
function formatNextRunDate(value: unknown): string {
  if (value == null) return "—";
  let d: Date;
  if (typeof value === "number") {
    if (value < 100000) {
      d = new Date(Date.UTC(2000, 0, 1));
      d.setUTCDate(d.getUTCDate() + value);
    } else {
      d = value < 10000000000 ? new Date(value * 1000) : new Date(value);
    }
  } else {
    d = new Date(value as string | Date);
  }
  if (isNaN(d.getTime()) || d.getFullYear() < 2022) return "—";
  return format(d, "dd MMM yyyy");
}

export default function AdminRecurringIncomeTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const { costCenterLabel } = useCostCenterLabel(tenantId);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState<RecurringIncomeTemplate | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<RecurringIncomeTemplate | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    campusId: "__corporate__",
    categoryId: "",
    amount: "",
    particulars: "",
    incomeType: "other",
    frequency: "monthly" as "monthly" | "weekly" | "quarterly",
    dayOfMonth: 1,
    dayOfWeek: 0,
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: "",
  });

  const [editForm, setEditForm] = useState({
    amount: "",
    particulars: "",
    incomeType: "other",
    frequency: "monthly" as "monthly" | "weekly" | "quarterly",
    dayOfMonth: 1,
    dayOfWeek: 0,
    endDate: "",
    isActive: true,
  });

  const qs = tenantId ? `?tenantId=${tenantId}` : "";

  const { data: templates = [], isLoading } = useQuery<RecurringIncomeTemplate[]>({
    queryKey: ["/api/admin/recurring-income-templates", tenantId, activeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantId) params.append("tenantId", tenantId);
      if (activeFilter !== "all") params.append("isActive", String(activeFilter === "active"));
      const res = await fetch(`/api/admin/recurring-income-templates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: categories = [] } = useQuery<IncomeCategory[]>({
    queryKey: ["/api/admin/income-categories", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-categories${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/cost-centers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/cost-centers${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: incomeTypes = [] } = useQuery<Array<{ slug: string; label: string }>>({
    queryKey: ["/api/admin/income-types", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-types${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const res = await apiRequest("POST", "/api/admin/recurring-income-templates", {
        tenantId,
        costCenterId: data.campusId === "__corporate__" ? "__corporate__" : data.campusId,
        categoryId: data.categoryId,
        amount: Math.round(parseFloat(data.amount)),
        particulars: data.particulars || null,
        incomeType: data.incomeType,
        frequency: data.frequency,
        dayOfMonth: data.frequency === "monthly" || data.frequency === "quarterly" ? data.dayOfMonth : undefined,
        dayOfWeek: data.frequency === "weekly" ? data.dayOfWeek : undefined,
        startDate: data.startDate,
        endDate: data.endDate || null,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recurring-income-templates"] });
      setCreateDialog(false);
      setCreateForm({
        campusId: "__corporate__",
        categoryId: "",
        amount: "",
        particulars: "",
        incomeType: "other",
        frequency: "monthly",
        dayOfMonth: 1,
        dayOfWeek: 0,
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: "",
      });
      toast({ title: "Recurring income template created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof editForm> }) => {
      const res = await apiRequest("PATCH", `/api/admin/recurring-income-templates/${id}`, {
        tenantId,
        ...data,
        amount: data.amount ? Math.round(parseFloat(String(data.amount))) : undefined,
        endDate: data.endDate === "" ? null : data.endDate,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recurring-income-templates"] });
      setEditDialog(null);
      setActionMenu(null);
      toast({ title: "Recurring income template updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/admin/recurring-income-templates/${id}${tenantId ? `?tenantId=${tenantId}` : ""}`;
      const res = await apiRequest("DELETE", url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recurring-income-templates"] });
      setDeleteDialog(null);
      setActionMenu(null);
      toast({ title: "Recurring income template deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.categoryId || !createForm.amount || parseFloat(createForm.amount) <= 0) {
      toast({ title: "Error", description: "Category and amount required", variant: "destructive" });
      return;
    }
    createMutation.mutate(createForm);
  };

  const handleEdit = (tpl: RecurringIncomeTemplate) => {
    setEditDialog(tpl);
    setEditForm({
      amount: String(tpl.amount),
      particulars: tpl.particulars || "",
      incomeType: tpl.incomeType,
      frequency: tpl.frequency as "monthly" | "weekly" | "quarterly",
      dayOfMonth: tpl.dayOfMonth ?? 1,
      dayOfWeek: tpl.dayOfWeek ?? 0,
      endDate: tpl.endDate ? format(new Date(tpl.endDate), "yyyy-MM-dd") : "",
      isActive: tpl.isActive,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDialog) return;
    updateMutation.mutate({
      id: editDialog.id,
      data: {
        ...editForm,
        amount: editForm.amount ? parseFloat(editForm.amount) : undefined,
      },
    });
  };

  const scheduleLabel = (tpl: RecurringIncomeTemplate) => {
    if (tpl.frequency === "monthly") return `Day ${tpl.dayOfMonth ?? 1} of month`;
    if (tpl.frequency === "weekly") return DAYS_OF_WEEK[tpl.dayOfWeek ?? 0];
    if (tpl.frequency === "quarterly") return `Day ${tpl.dayOfMonth ?? 1} every quarter`;
    return tpl.frequency;
  };

  if (!tenantId) {
    return (
      <div className="container max-w-7xl py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {isSuperAdmin ? "Select a tenant from the dropdown above to manage recurring income templates." : "Tenant context is required."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-6 w-6" />
                Recurring Income Templates
              </CardTitle>
              <CardDescription>
                Manage templates for recurring income (monthly fees, rent, etc.). Cron generates income records from these daily.
              </CardDescription>
            </div>
            <Button onClick={() => setCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Select value={activeFilter} onValueChange={(v: "all" | "active" | "inactive") => setActiveFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No recurring income templates. Create one to automate income records.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>{costCenterLabel}</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="max-w-[200px] truncate" title={tpl.particulars || undefined}>
                      {tpl.particulars || "—"}
                    </TableCell>
                    <TableCell>{tpl.categoryName || tpl.categoryId}</TableCell>
                    <TableCell>{tpl.campusName || tpl.costCenterName || "Corporate"}</TableCell>
                    <TableCell>
                      <span className="font-medium">₹ {(tpl.amount / 1).toLocaleString("en-IN")}</span>
                    </TableCell>
                    <TableCell>
                      {FREQUENCY_LABELS[tpl.frequency] || tpl.frequency} ({scheduleLabel(tpl)})
                    </TableCell>
                    <TableCell>{formatNextRunDate(tpl.nextRunDate)}</TableCell>
                    <TableCell>
                      <Badge variant={tpl.isActive ? "default" : "secondary"}>{tpl.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu open={actionMenu === tpl.id} onOpenChange={(o) => setActionMenu(o ? tpl.id : null)}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(tpl)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setActionMenu(null);
                              setDeleteDialog(tpl);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Recurring Income Template</DialogTitle>
            <DialogDescription>Create a template for recurring income. Income records will be generated daily by cron.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={createForm.categoryId} onValueChange={(v) => setCreateForm((f) => ({ ...f, categoryId: v }))} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{costCenterLabel}</Label>
              <Select value={createForm.campusId} onValueChange={(v) => setCreateForm((f) => ({ ...f, campusId: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__corporate__">Corporate Office</SelectItem>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min={1}
                value={createForm.amount}
                onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 50000"
                required
              />
            </div>
            <div>
              <Label>Particulars</Label>
              <Input
                value={createForm.particulars}
                onChange={(e) => setCreateForm((f) => ({ ...f, particulars: e.target.value }))}
                placeholder="e.g. Monthly tuition fees"
              />
            </div>
            <div>
              <Label>Income Type</Label>
              <Select value={createForm.incomeType} onValueChange={(v) => setCreateForm((f) => ({ ...f, incomeType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {incomeTypes.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.label}
                    </SelectItem>
                  ))}
                  {incomeTypes.length === 0 && <SelectItem value="other">Other</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequency</Label>
              <Select
                value={createForm.frequency}
                onValueChange={(v: "monthly" | "weekly" | "quarterly") => setCreateForm((f) => ({ ...f, frequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.frequency === "monthly" && (
              <div>
                <Label>Day of month (1–31)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={createForm.dayOfMonth}
                  onChange={(e) => setCreateForm((f) => ({ ...f, dayOfMonth: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
            )}
            {createForm.frequency === "weekly" && (
              <div>
                <Label>Day of week</Label>
                <Select
                  value={String(createForm.dayOfWeek)}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, dayOfWeek: parseInt(v, 10) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {createForm.frequency === "quarterly" && (
              <div>
                <Label>Day of month (1–31)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={createForm.dayOfMonth}
                  onChange={(e) => setCreateForm((f) => ({ ...f, dayOfMonth: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
            )}
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={createForm.startDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>End date (optional)</Label>
              <Input
                type="date"
                value={createForm.endDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(o) => !o && setEditDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Recurring Income Template</DialogTitle>
            <DialogDescription>Update amount, schedule, or deactivate. Category and {costCenterLabel} cannot be changed.</DialogDescription>
          </DialogHeader>
          {editDialog && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  min={1}
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Particulars</Label>
                <Input
                  value={editForm.particulars}
                  onChange={(e) => setEditForm((f) => ({ ...f, particulars: e.target.value }))}
                />
              </div>
              <div>
                <Label>Income Type</Label>
                <Select value={editForm.incomeType} onValueChange={(v) => setEditForm((f) => ({ ...f, incomeType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeTypes.map((t) => (
                      <SelectItem key={t.slug} value={t.slug}>
                        {t.label}
                      </SelectItem>
                    ))}
                    {incomeTypes.length === 0 && <SelectItem value="other">Other</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select
                  value={editForm.frequency}
                  onValueChange={(v: "monthly" | "weekly" | "quarterly") => setEditForm((f) => ({ ...f, frequency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editForm.frequency === "monthly" && (
                <div>
                  <Label>Day of month (1–31)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={editForm.dayOfMonth}
                    onChange={(e) => setEditForm((f) => ({ ...f, dayOfMonth: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
              )}
              {editForm.frequency === "weekly" && (
                <div>
                  <Label>Day of week</Label>
                  <Select
                    value={String(editForm.dayOfWeek)}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, dayOfWeek: parseInt(v, 10) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editForm.frequency === "quarterly" && (
                <div>
                  <Label>Day of month (1–31)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={editForm.dayOfMonth}
                    onChange={(e) => setEditForm((f) => ({ ...f, dayOfMonth: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
              )}
              <div>
                <Label>End date (optional)</Label>
                <Input
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editForm.isActive}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
                />
                <Label>Active</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Update
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recurring Income Template</DialogTitle>
            <DialogDescription>
              Are you sure? This will permanently remove the template. Existing income records generated from it will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
