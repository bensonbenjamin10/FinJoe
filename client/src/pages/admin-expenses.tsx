import { useState, useRef, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Receipt,
  Plus,
  Download,
  Loader2,
  CalendarIcon,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  IndianRupee,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag,
  Wallet,
  Eye,
  TrendingUp,
  Repeat,
  Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { formatIsoDate, parseIsoToDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import type {
  ExpenseWithDetails,
  ExpenseCategory,
  Campus,
  ExpenseWebAttachment,
} from "@shared/schema";

type ApiAttachmentsMeta = {
  web: ExpenseWebAttachment[];
  whatsapp: Array<{
    id: string;
    contentType: string;
    fileName: string | null;
    sizeBytes: number;
    createdAt: string;
  }>;
};

function ExpenseAttachmentsPanel({ expenseId, tenantId }: { expenseId: string; tenantId: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/expenses", expenseId, "attachments", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expenses/${expenseId}/attachments${q}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load attachments");
      return res.json() as ApiAttachmentsMeta;
    },
    enabled: !!tenantId && !!expenseId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (tenantId) fd.append("tenantId", tenantId);
      const url = `/api/admin/expenses/${expenseId}/attachments${q}`;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        let msg = await res.text();
        try {
          const j = JSON.parse(msg) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      void refetch();
      toast({ title: "Receipt uploaded" });
    },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (index: number) => {
      const res = await fetch(`/api/admin/expenses/${expenseId}/attachments/${index}${q}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      void refetch();
      toast({ title: "Attachment removed" });
    },
    onError: (e: Error) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const canDeleteWeb = (att: ExpenseWebAttachment) => {
    if (!user) return false;
    if (user.role === "super_admin" || user.role === "admin" || user.role === "finance") return true;
    return att.uploadedById === user.id;
  };

  if (!tenantId) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          Receipts & proof
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadMutation.mutate(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading attachments…</p>
      ) : (
        <div className="space-y-2">
          {data?.web?.length ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Uploaded from web</p>
              <ul className="space-y-1">
                {data.web.map((att, i) => {
                  const url = `/api/admin/expenses/${expenseId}/attachments/${i}${q}`;
                  const isImg = att.contentType.startsWith("image/");
                  return (
                    <li key={`web-${i}-${att.uploadedAt}`} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {isImg ? (
                          <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                            <img src={url} alt="" className="h-10 w-10 rounded object-cover border" />
                          </a>
                        ) : (
                          <a href={url} target="_blank" rel="noreferrer" className="text-primary underline truncate">
                            {att.fileName || "PDF"}
                          </a>
                        )}
                        <span className="text-muted-foreground truncate">
                          {(att.fileName || att.contentType).slice(0, 40)}
                        </span>
                      </div>
                      {canDeleteWeb(att) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm("Remove this attachment?")) deleteMutation.mutate(i);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {data?.whatsapp?.length ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <ul className="space-y-1">
                {data.whatsapp.map((m) => {
                  const murl = `/api/admin/media/${m.id}${q}`;
                  const isImg = m.contentType.startsWith("image/");
                  return (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      {isImg ? (
                        <a href={murl} target="_blank" rel="noreferrer">
                          <img src={murl} alt="" className="h-10 w-10 rounded object-cover border" />
                        </a>
                      ) : (
                        <a href={murl} target="_blank" rel="noreferrer" className="text-primary underline truncate">
                          {m.fileName || "Media"}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {!data?.web?.length && !data?.whatsapp?.length && (
            <p className="text-xs text-muted-foreground">No receipts yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
function PettyCashTab({
  funds,
  custodianUsers,
  costCenters,
  expenses,
  costCenterLabel,
  onCreateFund,
  onCreateReplenishment,
  isCreateFundPending,
  isCreateReplenishmentPending,
}: {
  funds: Array<{
    id: string;
    costCenterId: string;
    custodianId: string;
    imprestAmount: number;
    currentBalance: number;
    costCenterName?: string | null;
    custodianName?: string | null;
  }>;
  custodianUsers: Array<{ id: string; name?: string; email: string }>;
  costCenters: Campus[];
  expenses: ExpenseWithDetails[];
  costCenterLabel: string;
  onCreateFund: (data: { costCenterId: string; custodianId: string; imprestAmount: number }) => void;
  onCreateReplenishment: (data: { fundId: string; expenseIds: string[]; payoutMethod: string; payoutRef: string }) => void;
  isCreateFundPending: boolean;
  isCreateReplenishmentPending: boolean;
}) {
  const [fundDialog, setFundDialog] = useState(false);
  const [fundForm, setFundForm] = useState({ costCenterId: "", custodianId: "", imprestAmount: "" });
  const [replenishDialog, setReplenishDialog] = useState<{ fundId: string } | null>(null);
  const [replenishForm, setReplenishForm] = useState({ payoutMethod: "bank_transfer", payoutRef: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const costCenterById = new Map(costCenters.map((c) => [c.id, c]));
  const custodianById = new Map(custodianUsers.map((s) => [s.id, s]));

  const approvedForFund = (fundId: string) =>
    expenses.filter(
      (e) =>
        e.status === "approved" &&
        e.pettyCashFundId === fundId &&
        !e.pettyCashReplenishmentId
    );

  const replenishPool = replenishDialog ? approvedForFund(replenishDialog.fundId) : [];

  const handleCreateFund = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(fundForm.imprestAmount, 10);
    if (!fundForm.costCenterId || !fundForm.custodianId || isNaN(amt) || amt < 0) return;
    onCreateFund({ costCenterId: fundForm.costCenterId, custodianId: fundForm.custodianId, imprestAmount: amt });
    setFundForm({ costCenterId: "", custodianId: "", imprestAmount: "" });
    setFundDialog(false);
  };

  const handleReplenish = () => {
    if (!replenishDialog || selectedIds.size === 0 || !replenishForm.payoutRef.trim()) return;
    onCreateReplenishment({
      fundId: replenishDialog.fundId,
      expenseIds: Array.from(selectedIds),
      payoutMethod: replenishForm.payoutMethod,
      payoutRef: replenishForm.payoutRef.trim(),
    });
    setReplenishDialog(null);
    setReplenishForm({ payoutMethod: "bank_transfer", payoutRef: "" });
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === replenishPool.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(replenishPool.map((e) => e.id)));
  };

  const selectedTotal = replenishPool
    .filter((e) => selectedIds.has(e.id))
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Petty Cash Funds
          </CardTitle>
          <CardDescription>
            Manage imprest per {costCenterLabel.toLowerCase()} and custodian. Tag expenses with this fund before approval; then record replenishments
            when reimbursing the custodian (restores float up to imprest).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setFundDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Fund
          </Button>
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{costCenterLabel}</TableHead>
                <TableHead>Custodian</TableHead>
                <TableHead>Imprest (₹)</TableHead>
                <TableHead>Balance (₹)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.map((f) => {
                const pool = approvedForFund(f.id);
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.costCenterName ?? costCenterById.get(f.costCenterId)?.name ?? f.costCenterId}</TableCell>
                    <TableCell>
                      {(custodianById.get(f.custodianId)?.name || custodianById.get(f.custodianId)?.email) ?? f.custodianId}
                    </TableCell>
                    <TableCell>₹ {f.imprestAmount.toLocaleString("en-IN")}</TableCell>
                    <TableCell>₹ {f.currentBalance.toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedIds(new Set());
                          setReplenishDialog({ fundId: f.id });
                        }}
                        disabled={pool.length === 0}
                      >
                        Replenish
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {funds.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">No petty cash funds. Create one to get started.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={fundDialog} onOpenChange={setFundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Petty Cash Fund</DialogTitle>
            <DialogDescription>Set up an imprest fund for a {costCenterLabel.toLowerCase()} custodian.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFund} className="space-y-4">
            <div>
              <Label>{costCenterLabel} *</Label>
              <Select value={fundForm.costCenterId} onValueChange={(v) => setFundForm((f) => ({ ...f, costCenterId: v }))} required>
                <SelectTrigger><SelectValue placeholder={`Select ${costCenterLabel.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {costCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Custodian *</Label>
              <Select value={fundForm.custodianId} onValueChange={(v) => setFundForm((f) => ({ ...f, custodianId: v }))} required>
                <SelectTrigger><SelectValue placeholder="Select custodian" /></SelectTrigger>
                <SelectContent>
                  {custodianUsers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name || s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Imprest Amount (₹) *</Label>
              <Input
                type="number"
                min="0"
                value={fundForm.imprestAmount}
                onChange={(e) => setFundForm((f) => ({ ...f, imprestAmount: e.target.value }))}
                placeholder="e.g. 50000"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFundDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isCreateFundPending}>
                {isCreateFundPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replenishDialog} onOpenChange={() => setReplenishDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Replenishment</DialogTitle>
            <DialogDescription>
              Select approved expenses tagged to this fund. Enter UTR or reference after payment to the custodian.
            </DialogDescription>
          </DialogHeader>
          {replenishDialog && (
            <>
              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={selectAll} disabled={replenishPool.length === 0}>
                  {selectedIds.size === replenishPool.length && replenishPool.length > 0 ? "Deselect all" : "Select all"}
                </Button>
                {replenishPool.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No approved expenses linked to this fund. Edit a draft expense, set the petty cash fund to match this {costCenterLabel.toLowerCase()}, then submit and approve.
                  </p>
                ) : (
                  <>
                    <div className="max-h-48 overflow-auto border rounded">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {replenishPool.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(e.id)}
                                  onChange={() => toggleSelect(e.id)}
                                />
                              </TableCell>
                              <TableCell>{formatIsoDate(e.expenseDate, "dd MMM yyyy")}</TableCell>
                              <TableCell>{e.description || e.particulars || "—"}</TableCell>
                              <TableCell>₹ {e.amount.toLocaleString("en-IN")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm font-medium">Selected total: ₹ {selectedTotal.toLocaleString("en-IN")}</p>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payout Method</Label>
                  <Select value={replenishForm.payoutMethod} onValueChange={(v) => setReplenishForm((f) => ({ ...f, payoutMethod: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="demand_draft">Demand Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>UTR / Transaction Reference *</Label>
                  <Input
                    value={replenishForm.payoutRef}
                    onChange={(e) => setReplenishForm((f) => ({ ...f, payoutRef: e.target.value }))}
                    placeholder="e.g. UTR number, cheque no."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReplenishDialog(null)}>Cancel</Button>
                <Button
                  onClick={handleReplenish}
                  disabled={selectedIds.size === 0 || !replenishForm.payoutRef.trim() || isCreateReplenishmentPending}
                >
                  {isCreateReplenishmentPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Replenishment"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  submitted: { label: "Submitted", variant: "secondary" },
  pending_approval: { label: "Pending Approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  paid: { label: "Paid", variant: "default" },
};

export default function AdminExpenses() {
  const { toast } = useToast();
  const { user, canApproveExpenses, canImportExpenses } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tabFromUrl = searchParams.get("tab");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const { costCenterLabel } = useCostCenterLabel(tenantId);
  const [activeTab, setActiveTab] = useState("list");

  useEffect(() => {
    if (tabFromUrl === "petty-cash" && canApproveExpenses) setActiveTab("petty-cash");
  }, [tabFromUrl, canApproveExpenses]);
  const [filters, setFilters] = useState({
    campusId: "all",
    status: "all",
    categoryId: "all",
    source: "all",
    startDate: "",
    endDate: "",
    noDate: false,
  });
  const [createForm, setCreateForm] = useState({
    campusId: "__corporate__",
    categoryId: "",
    amount: "",
    expenseDate: new Date(),
    description: "",
    invoiceNumber: "",
    invoiceDate: "" as string,
    vendorName: "",
    gstin: "",
    taxType: "",
    voucherNumber: "",
    pettyCashFundId: "" as string,
  });
  const [actionMenu, setActionMenu] = useState<{ expense: ExpenseWithDetails; open: boolean } | null>(null);
  const [approveDialog, setApproveDialog] = useState<ExpenseWithDetails | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ expense: ExpenseWithDetails; reason: string } | null>(null);
  const [payoutDialog, setPayoutDialog] = useState<{ expense: ExpenseWithDetails; method: string; ref: string } | null>(null);
  const [editExpenseDialog, setEditExpenseDialog] = useState<ExpenseWithDetails | null>(null);
  const [viewExpenseDialog, setViewExpenseDialog] = useState<ExpenseWithDetails | null>(null);
  const [deleteExpenseDialog, setDeleteExpenseDialog] = useState<ExpenseWithDetails | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ mode: "add" | "edit"; category?: ExpenseCategory } | null>(null);
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<ExpenseCategory | null>(null);
  const [exportStart, setExportStart] = useState<Date | undefined>();
  const [exportEnd, setExportEnd] = useState<Date | undefined>();
  const LIST_PAGE_SIZE = 100;
  const [expenseOffset, setExpenseOffset] = useState(0);
  const [allExpenses, setAllExpenses] = useState<ExpenseWithDetails[]>([]);

  const buildQueryParams = (offset: number) => {
    const params = new URLSearchParams();
    if (tenantId) params.append("tenantId", tenantId);
    const campusVal = filters.campusId && filters.campusId !== "all" ? filters.campusId : null;
    if (campusVal) params.append("campusId", campusVal === "corporate" || campusVal === "__corporate__" ? "__corporate__" : campusVal);
    if (filters.status && filters.status !== "all") params.append("status", filters.status);
    if (filters.categoryId && filters.categoryId !== "all") params.append("categoryId", filters.categoryId);
    if (filters.source && filters.source !== "all") params.append("source", filters.source);
    if (filters.noDate) {
      params.append("noDate", "1");
    } else {
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
    }
    params.append("limit", String(LIST_PAGE_SIZE));
    params.append("offset", String(offset));
    return params.toString();
  };

  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setExpenseOffset(0);
    setAllExpenses([]);
  }, [filtersKey]);

  const qs = tenantId ? `?tenantId=${tenantId}` : "";
  const { data: expensesData, isLoading } = useQuery<{ rows: ExpenseWithDetails[]; total: number; hasMore: boolean; offset: number }>({
    queryKey: ["/api/admin/expenses", filters, tenantId, expenseOffset],
    queryFn: async () => {
      const q = buildQueryParams(expenseOffset);
      const res = await fetch(`/api/admin/expenses?${q}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!expensesData) return;
    if (expensesData.offset === 0) {
      setAllExpenses(expensesData.rows);
    } else {
      setAllExpenses((prev) => [...prev, ...expensesData.rows]);
    }
  }, [expensesData]);

  const expenses = allExpenses;
  const expensesTotal = expensesData?.total ?? 0;
  const expensesHasMore = expensesData?.hasMore ?? false;

  const { data: finjoeSettings } = useQuery<{ requireConfirmationBeforePost?: boolean } | null>({
    queryKey: ["/api/admin/finjoe/settings", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/settings${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantId,
  });

  const [createConfirmDialog, setCreateConfirmDialog] = useState<Record<string, unknown> | null>(null);

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expense-categories${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: categoriesForAdmin = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories", "admin", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expense-categories?includeInactive=true${tenantId ? `&tenantId=${tenantId}` : ""}`, { credentials: "include" });
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

  const { data: incomeCategoriesForImport = [] } = useQuery<Array<{ id: string; name: string; slug: string }>>({
    queryKey: ["/api/admin/income-categories", "import", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-categories${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId && canImportExpenses,
  });

  const { data: pettyCashFunds = [] } = useQuery<
    Array<{
      id: string;
      costCenterId: string;
      custodianId: string;
      imprestAmount: number;
      currentBalance: number;
      costCenterName?: string | null;
    }>
  >({
    queryKey: ["/api/admin/petty-cash/funds", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/petty-cash/funds${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId && canApproveExpenses,
  });

  const pettyFundsForCreate = useMemo(
    () =>
      createForm.campusId && createForm.campusId !== "__corporate__"
        ? pettyCashFunds.filter((f) => f.costCenterId === createForm.campusId)
        : [],
    [pettyCashFunds, createForm.campusId]
  );

  const { data: vendorSuggestions = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/expenses/vendor-suggestions", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expenses/vendor-suggestions${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: custodianUsers = [] } = useQuery<Array<{ id: string; name: string; email: string; role: string }>>({
    queryKey: ["/api/admin/petty-cash/custodians", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/petty-cash/custodians${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId && canApproveExpenses,
  });

  const createFundMutation = useMutation({
    mutationFn: async (data: { costCenterId: string; custodianId: string; imprestAmount: number }) => {
      const res = await apiRequest("POST", "/api/admin/petty-cash/funds", { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create fund");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/petty-cash/funds"] });
      toast({ title: "Petty cash fund created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createReplenishmentMutation = useMutation({
    mutationFn: async (data: { fundId: string; expenseIds: string[]; payoutMethod: string; payoutRef: string }) => {
      const res = await apiRequest("POST", "/api/admin/petty-cash/replenishments", { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create replenishment");
      }
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/petty-cash/replenishments"] });
      toast({ title: "Replenishment recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/expense-categories/seed", { tenantId });
      if (!res.ok) throw new Error("Failed to seed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-categories"] });
      toast({ title: "Categories seeded", description: `Created ${data.created}, skipped ${data.skipped}` });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/expenses", { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setCreateForm({
        campusId: "__corporate__",
        categoryId: "",
        amount: "",
        expenseDate: new Date(),
        description: "",
        invoiceNumber: "",
        invoiceDate: "",
        vendorName: "",
        gstin: "",
        taxType: "",
        voucherNumber: "",
        pettyCashFundId: "",
      });
      setActiveTab("list");
      toast({ title: "Expense created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/submit`, { tenantId });
      if (!res.ok) throw new Error("Failed to submit");
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setActionMenu(null);
      toast({ title: "Expense submitted" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/approve`, { tenantId });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setApproveDialog(null);
      toast({ title: "Expense approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/reject`, { reason, tenantId });
      if (!res.ok) throw new Error("Failed to reject");
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setRejectDialog(null);
      toast({ title: "Expense rejected" });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: async ({ id, payoutMethod, payoutRef }: { id: string; payoutMethod: string; payoutRef: string }) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/payout`, { payoutMethod, payoutRef, tenantId });
      if (!res.ok) throw new Error("Failed to record payout");
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setPayoutDialog(null);
      toast({ title: "Payout recorded" });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/expenses/${id}`, { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setEditExpenseDialog(null);
      toast({ title: "Expense updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/admin/expenses/${id}${tenantId ? `?tenantId=${tenantId}` : ""}`;
      const res = await apiRequest("DELETE", url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setDeleteExpenseDialog(null);
      toast({ title: "Expense deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; cashflowLabel: string; displayOrder?: number }) => {
      const res = await apiRequest("POST", "/api/admin/expense-categories", { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-categories"] });
      setCategoryDialog(null);
      toast({ title: "Category created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ name: string; slug: string; cashflowLabel: string; displayOrder: number; isActive: boolean }> }) => {
      const res = await apiRequest("PATCH", `/api/admin/expense-categories/${id}`, { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-categories"] });
      setCategoryDialog(null);
      toast({ title: "Category updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/admin/expense-categories/${id}${tenantId ? `?tenantId=${tenantId}` : ""}`;
      const res = await apiRequest("DELETE", url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-categories"] });
      setDeleteCategoryDialog(null);
      toast({ title: "Category deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.categoryId || !createForm.amount || parseFloat(createForm.amount) <= 0) {
      toast({ title: "Error", description: "Category and amount required", variant: "destructive" });
      return;
    }
    const payload = {
      campusId: (createForm.campusId && createForm.campusId !== "__corporate__") ? createForm.campusId : null,
      categoryId: createForm.categoryId,
      amount: Math.round(parseFloat(createForm.amount)),
      expenseDate: format(createForm.expenseDate, "yyyy-MM-dd"),
      description: createForm.description || undefined,
      invoiceNumber: createForm.invoiceNumber || undefined,
      invoiceDate: createForm.invoiceDate || undefined,
      vendorName: createForm.vendorName || undefined,
      gstin: createForm.gstin || undefined,
      taxType: createForm.taxType || undefined,
      voucherNumber: createForm.voucherNumber || undefined,
      pettyCashFundId: createForm.pettyCashFundId || undefined,
      status: "draft",
    };
    if (finjoeSettings?.requireConfirmationBeforePost) {
      setCreateConfirmDialog(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleExport = () => {
    if (!exportStart || !exportEnd) {
      toast({ title: "Select date range", description: "Start and end dates are required for export.", variant: "destructive" });
      return;
    }
    const params = new URLSearchParams();
    if (tenantId) params.append("tenantId", tenantId);
    params.append("startDate", format(exportStart, "yyyy-MM-dd"));
    params.append("endDate", format(exportEnd, "yyyy-MM-dd"));
    window.open(`/api/admin/expenses/export?${params.toString()}`, "_blank");
    toast({ title: "Export started" });
  };

  if (!tenantId) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {isSuperAdmin ? "Select a tenant from the dropdown above to manage expenses." : "Tenant context is required."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-6 w-6" />
                Expense Management
              </CardTitle>
              <CardDescription>
                Manage campus and corporate office expenses, approvals, and payouts.
              </CardDescription>
            </div>
            <Link href={tenantId ? `/admin/income?tenantId=${tenantId}` : "/admin/income"}>
              <Button variant="outline" size="sm">
                <TrendingUp className="h-4 w-4 mr-2" />
                Income
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              {canImportExpenses && <TabsTrigger value="export">Export</TabsTrigger>}
              {canApproveExpenses && <TabsTrigger value="petty-cash">Petty Cash</TabsTrigger>}
            </TabsList>

            <TabsContent value="list">
              <div className="space-y-4">
                {canImportExpenses && (
                  <div className="rounded-lg border bg-muted/40 p-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Import bank statements, PDFs, Excel, and more from{" "}
                      <Link href="/admin/data-handling" className="font-medium text-primary underline underline-offset-2">
                        Data Handling
                      </Link>
                      .
                    </p>
                  </div>
                )}
                {categories.length === 0 && (
                  <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
                    <p>No expense categories. Seed them first.</p>
                    <Button size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                      {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Seed Categories"}
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Select value={filters.campusId} onValueChange={(v) => setFilters((f) => ({ ...f, campusId: v }))}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={costCenterLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {costCenterLabel}s</SelectItem>
                      <SelectItem value="corporate">Corporate Office</SelectItem>
                      {campuses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {Object.entries(STATUS_BADGES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.categoryId} onValueChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.source} onValueChange={(v) => setFilters((f) => ({ ...f, source: v }))}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="manual">Web</SelectItem>
                      <SelectItem value="finjoe">FinJoe</SelectItem>
                      <SelectItem value="bank_import">Bank Import</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={filters.noDate}
                      onChange={(e) => setFilters((f) => ({ ...f, noDate: e.target.checked, startDate: "", endDate: "" }))}
                    />
                    Missing date
                  </label>
                  {!filters.noDate && (
                    <>
                      <Input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                        className="w-[150px]"
                      />
                      <Input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                        className="w-[150px]"
                      />
                    </>
                  )}
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Campus</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((exp) => (
                        <TableRow key={exp.id}>
                          <TableCell>{formatIsoDate(exp.expenseDate, "dd MMM yyyy")}</TableCell>
                          <TableCell className="max-w-[200px]">
                            <div className="flex flex-col gap-0.5 truncate">
                              <div className="flex items-center gap-2 truncate">
                                {(exp as ExpenseWithDetails).recurringTemplateId && (
                                  <Link href={tenantId ? `/admin/recurring-templates?tenantId=${tenantId}` : "/admin/recurring-templates"}>
                                    <Badge variant="secondary" className="shrink-0 text-xs gap-1 cursor-pointer hover:bg-secondary/80">
                                      <Repeat className="h-3 w-3" />
                                      Recurring
                                    </Badge>
                                  </Link>
                                )}
                                {(((exp as ExpenseWithDetails).webAttachmentCount ?? 0) > 0 ||
                                  ((exp as ExpenseWithDetails).whatsappMediaCount ?? 0) > 0) && (
                                  <Paperclip
                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                    aria-label="Has receipt or proof"
                                  />
                                )}
                                <span className="truncate" title={exp.description || exp.particulars || undefined}>
                                  {exp.description || exp.particulars || "—"}
                                </span>
                              </div>
                              {((exp as any).submittedByName || (exp as any).submittedById) && (
                                <div className="text-xs text-muted-foreground truncate">
                                  Req: {(exp as any).submittedByName || "Unknown"}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[120px] truncate" title={(exp as any).invoiceNumber}>
                            {(exp as any).invoiceNumber || "—"}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate" title={(exp as any).vendorName}>
                            {(exp as any).vendorName || "—"}
                          </TableCell>
                          <TableCell>{(exp as any).category?.name || "-"}</TableCell>
                          <TableCell>{(exp as any).campus?.name || "Corporate Office"}</TableCell>
                          <TableCell>
                            <span className="font-medium">
                              ₹ {(exp.amount / 1).toLocaleString("en-IN")}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={STATUS_BADGES[exp.status]?.variant || "outline"}
                              title={`Requested: ${(exp as any).submittedByName || "Unknown"}\nApproved: ${(exp as any).approvedByName || "Pending"}`}
                            >
                              {STATUS_BADGES[exp.status]?.label || exp.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Popover
                              open={actionMenu?.expense?.id === exp.id && actionMenu?.open}
                              onOpenChange={(open) =>
                                setActionMenu(open ? { expense: exp, open: true } : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="end">
                                <div className="flex flex-col gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setActionMenu(null);
                                      setViewExpenseDialog(exp);
                                    }}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View Details
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setActionMenu(null);
                                      setEditExpenseDialog(exp);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 mr-1" />
                                    Edit
                                  </Button>
                                  {exp.status === "draft" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setActionMenu(null);
                                          setDeleteExpenseDialog(exp);
                                        }}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Delete
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => submitMutation.mutate(exp.id)}
                                      >
                                        Submit for Approval
                                      </Button>
                                    </>
                                  )}
                                  {canApproveExpenses && exp.status === "pending_approval" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setActionMenu(null);
                                          setApproveDialog(exp);
                                        }}
                                      >
                                        Approve
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive"
                                        onClick={() => {
                                          setActionMenu(null);
                                          setRejectDialog({ expense: exp, reason: "" });
                                        }}
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                  {canApproveExpenses && exp.status === "approved" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setActionMenu(null);
                                        setPayoutDialog({ expense: exp, method: "bank_transfer", ref: "" });
                                      }}
                                    >
                                      Record Payout
                                    </Button>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {!isLoading && expensesHasMore && (
                  <div className="flex justify-center py-4">
                    <Button
                      variant="outline"
                      onClick={() => setExpenseOffset((o) => o + LIST_PAGE_SIZE)}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Load more ({expenses.length} of {expensesTotal} shown)
                    </Button>
                  </div>
                )}
                {!isLoading && expenses.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No expenses found.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="create">
              <form onSubmit={handleCreate} className="space-y-4 max-w-md">
                <div>
                  <Label>Campus</Label>
                  <Select
                    value={createForm.campusId}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, campusId: v, pettyCashFundId: "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select campus (optional)" />
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
                {pettyFundsForCreate.length > 0 && (
                  <div>
                    <Label>Petty cash fund (optional)</Label>
                    <Select
                      value={createForm.pettyCashFundId || "__none__"}
                      onValueChange={(v) => setCreateForm((f) => ({ ...f, pettyCashFundId: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not paid from petty cash" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not paid from petty cash</SelectItem>
                        {pettyFundsForCreate.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            Imprest ₹{f.imprestAmount.toLocaleString("en-IN")} — balance ₹{f.currentBalance.toLocaleString("en-IN")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      When set, approving this expense reduces the fund balance; record replenishment later to restore float.
                    </p>
                  </div>
                )}
                <div>
                  <Label>Category *</Label>
                  <Select
                    value={createForm.categoryId}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, categoryId: v }))}
                  >
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
                  <Label>Item Name</Label>
                  <Input
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="e.g., Office Rent March 2025, Staff Salary, Printing"
                  />
                </div>
                <div>
                  <Label>Invoice Number</Label>
                  <Input
                    value={createForm.invoiceNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                    placeholder="e.g., INV-2025-001"
                  />
                </div>
                <div>
                  <Label>Invoice Date</Label>
                  <Input
                    type="date"
                    value={createForm.invoiceDate}
                    onChange={(e) => setCreateForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Vendor / Supplier Name</Label>
                  <Input
                    list="vendor-suggestions-create"
                    value={createForm.vendorName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, vendorName: e.target.value }))}
                    placeholder="e.g., ABC Supplies Pvt Ltd"
                  />
                  <datalist id="vendor-suggestions-create">
                    {vendorSuggestions.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label>GSTIN (optional)</Label>
                  <Input
                    value={createForm.gstin}
                    onChange={(e) => setCreateForm((f) => ({ ...f, gstin: e.target.value }))}
                    placeholder="15-character GSTIN"
                    maxLength={15}
                  />
                </div>
                <div>
                  <Label>Tax Type</Label>
                  <Select value={createForm.taxType || "none"} onValueChange={(v) => setCreateForm((f) => ({ ...f, taxType: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select tax treatment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="no_gst">No GST</SelectItem>
                      <SelectItem value="gst_itc">GST (ITC availed)</SelectItem>
                      <SelectItem value="gst_rcm">GST (Reverse Charge)</SelectItem>
                      <SelectItem value="gst_no_itc">GST (No ITC)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Voucher Number</Label>
                  <Input
                    value={createForm.voucherNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, voucherNumber: e.target.value }))}
                    placeholder="e.g., VOU-2025-00001"
                  />
                </div>
                <div>
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start", !createForm.expenseDate && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {createForm.expenseDate
                          ? format(createForm.expenseDate, "PPP")
                          : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <Calendar
                        mode="single"
                        selected={createForm.expenseDate}
                        onSelect={(d) => d && setCreateForm((f) => ({ ...f, expenseDate: d }))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Expense"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="categories">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Manage expense categories for MIS/Cashflow mapping. Categories with expenses cannot be deleted.
                  </p>
                  <Button onClick={() => setCategoryDialog({ mode: "add" })}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Category
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Cashflow Label</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoriesForAdmin.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="font-mono text-sm">{c.slug}</TableCell>
                        <TableCell className="text-muted-foreground">{c.cashflowLabel}</TableCell>
                        <TableCell>{c.displayOrder}</TableCell>
                        <TableCell>
                          <Badge variant={c.isActive ? "default" : "secondary"}>
                            {c.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCategoryDialog({ mode: "edit", category: c })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteCategoryDialog(c)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {categoriesForAdmin.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No categories.{" "}
                    <Button variant="ghost" className="p-0 h-auto text-primary underline" onClick={() => seedMutation.mutate()}>
                      Seed default categories
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="export">
              <Card>
                <CardHeader>
                  <CardTitle>Export Cashflow Report</CardTitle>
                  <CardDescription>
                    Cashflow Summary: category/month aggregation. Detailed: all expense rows with invoice, vendor, UTR, voucher, etc.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-[200px]", !exportStart && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {exportStart ? format(exportStart, "PPP") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent>
                          <Calendar mode="single" selected={exportStart} onSelect={setExportStart} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-[200px]", !exportEnd && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {exportEnd ? format(exportEnd, "PPP") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent>
                          <Calendar mode="single" selected={exportEnd} onSelect={setExportEnd} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleExport} disabled={!exportStart || !exportEnd}>
                      <Download className="mr-2 h-4 w-4" />
                      Cashflow Summary
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!exportStart || !exportEnd) {
                          toast({ title: "Select date range", description: "Start and end dates are required.", variant: "destructive" });
                          return;
                        }
                        const params = new URLSearchParams();
                        params.append("startDate", format(exportStart, "yyyy-MM-dd"));
                        params.append("endDate", format(exportEnd, "yyyy-MM-dd"));
                        window.open(`/api/admin/expenses/export/detailed?${params.toString()}`, "_blank");
                        toast({ title: "Detailed export started" });
                      }}
                      disabled={!exportStart || !exportEnd}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Detailed (All Fields)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {canApproveExpenses && (
              <TabsContent value="petty-cash">
                <PettyCashTab
                  funds={pettyCashFunds}
                  custodianUsers={custodianUsers}
                  costCenters={campuses}
                  expenses={expenses}
                  costCenterLabel={costCenterLabel}
                  onCreateFund={(data) => createFundMutation.mutate(data)}
                  onCreateReplenishment={(data) => createReplenishmentMutation.mutate(data)}
                  isCreateFundPending={createFundMutation.isPending}
                  isCreateReplenishmentPending={createReplenishmentMutation.isPending}
                />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this expense?
              {approveDialog && (
                <p className="mt-2 font-medium">
                  {(approveDialog as any).description || (approveDialog as any).particulars
                    ? `${(approveDialog as any).description || (approveDialog as any).particulars} — `
                    : ""}
                  ₹ {approveDialog.amount.toLocaleString("en-IN")} ({(approveDialog as any).category?.name})
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => approveDialog && approveMutation.mutate(approveDialog.id)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Expense Confirmation Dialog */}
      <Dialog open={!!createConfirmDialog} onOpenChange={() => !createMutation.isPending && setCreateConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Expense</DialogTitle>
            <DialogDescription>
              {createConfirmDialog && (
                <div className="space-y-1 mt-2">
                  <p><strong>₹ {(createConfirmDialog.amount as number)?.toLocaleString("en-IN")}</strong></p>
                  <p>{categories.find((c) => c.id === createConfirmDialog.categoryId)?.name ?? createConfirmDialog.categoryId}</p>
                  <p>{createConfirmDialog.campusId ? campuses.find((c) => c.id === createConfirmDialog.campusId)?.name ?? createConfirmDialog.campusId : "Corporate Office"}</p>
                  {createConfirmDialog.vendorName && <p>Vendor: {String(createConfirmDialog.vendorName)}</p>}
                  {createConfirmDialog.description && <p>{String(createConfirmDialog.description)}</p>}
                </div>
              )}
              Create this expense?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateConfirmDialog(null)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (createConfirmDialog) {
                  createMutation.mutate(createConfirmDialog);
                  setCreateConfirmDialog(null);
                }
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
            <DialogDescription>Provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={rejectDialog?.reason ?? ""}
              onChange={(e) =>
                setRejectDialog((r) => (r ? { ...r, reason: e.target.value } : null))
              }
              placeholder="Rejection reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectDialog &&
                rejectMutation.mutate({ id: rejectDialog.expense.id, reason: rejectDialog.reason || "Rejected" })
              }
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payout Dialog */}
      <Dialog open={!!payoutDialog} onOpenChange={() => setPayoutDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payout</DialogTitle>
            <DialogDescription>
              Record the payout method and reference for this expense.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Payout Method</Label>
              <Select
                value={payoutDialog?.method ?? "bank_transfer"}
                onValueChange={(v) =>
                  setPayoutDialog((p) => (p ? { ...p, method: v } : null))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="demand_draft">Demand Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction Reference</Label>
              <Input
                value={payoutDialog?.ref ?? ""}
                onChange={(e) =>
                  setPayoutDialog((p) => (p ? { ...p, ref: e.target.value } : null))
                }
                placeholder="e.g. UTR number, cheque no."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                payoutDialog &&
                payoutMutation.mutate({
                  id: payoutDialog.expense.id,
                  payoutMethod: payoutDialog.method,
                  payoutRef: payoutDialog.ref,
                })
              }
              disabled={payoutMutation.isPending || !payoutDialog?.ref?.trim()}
            >
              {payoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Payout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Expense Dialog */}
      <Dialog open={!!viewExpenseDialog} onOpenChange={() => setViewExpenseDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
            <DialogDescription>View all expense and documentation fields.</DialogDescription>
          </DialogHeader>
          {viewExpenseDialog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-medium">{formatIsoDate(viewExpenseDialog.expenseDate, "dd MMM yyyy")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount</span>
                  <p className="font-medium">₹ {viewExpenseDialog.amount.toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Category</span>
                  <p className="font-medium">{(viewExpenseDialog as any).category?.name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Campus</span>
                  <p className="font-medium">{(viewExpenseDialog as any).campus?.name || "Corporate Office"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Description</span>
                  <p className="font-medium">{viewExpenseDialog.description || viewExpenseDialog.particulars || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Invoice Number</span>
                  <p className="font-medium">{(viewExpenseDialog as any).invoiceNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Invoice Date</span>
                  <p className="font-medium">{(viewExpenseDialog as any).invoiceDate ? format(new Date((viewExpenseDialog as any).invoiceDate), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vendor</span>
                  <p className="font-medium">{(viewExpenseDialog as any).vendorName || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">GSTIN</span>
                  <p className="font-medium">{(viewExpenseDialog as any).gstin || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tax Type</span>
                  <p className="font-medium">{(viewExpenseDialog as any).taxType || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Voucher Number</span>
                  <p className="font-medium">{(viewExpenseDialog as any).voucherNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-medium">
                    <Badge variant={STATUS_BADGES[viewExpenseDialog.status]?.variant || "outline"}>
                      {STATUS_BADGES[viewExpenseDialog.status]?.label || viewExpenseDialog.status}
                    </Badge>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Requested By</span>
                  <p className="font-medium">{(viewExpenseDialog as any).submittedByName || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Approved By</span>
                  <p className="font-medium">{(viewExpenseDialog as any).approvedByName || "—"}</p>
                </div>
                {(viewExpenseDialog.status === "paid" && (viewExpenseDialog.payoutRef || (viewExpenseDialog as any).replenishmentId)) && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">UTR / Payout Reference</span>
                    <p className="font-medium">{viewExpenseDialog.payoutRef || "—"}</p>
                  </div>
                )}
              </div>
              <ExpenseAttachmentsPanel expenseId={viewExpenseDialog.id} tenantId={tenantId} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewExpenseDialog(null)}>Close</Button>
                <Button onClick={() => { setEditExpenseDialog(viewExpenseDialog); setViewExpenseDialog(null); }}>
                  Edit
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editExpenseDialog} onOpenChange={() => setEditExpenseDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>Update expense details.</DialogDescription>
          </DialogHeader>
          {editExpenseDialog && (
            <EditExpenseForm
              expense={editExpenseDialog}
              tenantId={tenantId}
              categories={categories}
              campuses={campuses}
              pettyCashFunds={pettyCashFunds}
              costCenterLabel={costCenterLabel}
              vendorSuggestions={vendorSuggestions}
              onSave={(data) => updateExpenseMutation.mutate({ id: editExpenseDialog.id, data })}
              onCancel={() => setEditExpenseDialog(null)}
              isPending={updateExpenseMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Expense Dialog */}
      <Dialog open={!!deleteExpenseDialog} onOpenChange={() => setDeleteExpenseDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this draft expense? This cannot be undone.
              {deleteExpenseDialog && (
                <p className="mt-2 font-medium">
                  {(deleteExpenseDialog as any).description || (deleteExpenseDialog as any).particulars
                    ? `${(deleteExpenseDialog as any).description || (deleteExpenseDialog as any).particulars} — `
                    : ""}
                  ₹ {deleteExpenseDialog.amount.toLocaleString("en-IN")} ({(deleteExpenseDialog as any).category?.name})
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExpenseDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteExpenseDialog && deleteExpenseMutation.mutate(deleteExpenseDialog.id)}
              disabled={deleteExpenseMutation.isPending}
            >
              {deleteExpenseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Add/Edit Dialog */}
      <Dialog open={!!categoryDialog} onOpenChange={() => setCategoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialog?.mode === "edit" ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>
              {categoryDialog?.mode === "edit"
                ? "Update category name, slug, or cashflow label."
                : "Create a new expense category for MIS mapping."}
            </DialogDescription>
          </DialogHeader>
          {categoryDialog && (
            <CategoryForm
              category={categoryDialog.category}
              onSave={(data) => {
                if (categoryDialog.mode === "edit" && categoryDialog.category) {
                  updateCategoryMutation.mutate({ id: categoryDialog.category.id, data });
                } else {
                  createCategoryMutation.mutate(data as { name: string; slug: string; cashflowLabel: string; displayOrder?: number });
                }
              }}
              onCancel={() => setCategoryDialog(null)}
              isPending={createCategoryMutation.isPending || updateCategoryMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <Dialog open={!!deleteCategoryDialog} onOpenChange={() => setDeleteCategoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteCategoryDialog?.name}&quot;? Categories with linked expenses cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCategoryDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteCategoryDialog && deleteCategoryMutation.mutate(deleteCategoryDialog.id)}
              disabled={deleteCategoryMutation.isPending}
            >
              {deleteCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditExpenseForm({
  expense,
  tenantId,
  categories,
  campuses,
  pettyCashFunds,
  costCenterLabel,
  vendorSuggestions = [],
  onSave,
  onCancel,
  isPending,
}: {
  expense: ExpenseWithDetails;
  tenantId: string | null;
  categories: ExpenseCategory[];
  campuses: Campus[];
  pettyCashFunds: Array<{ id: string; costCenterId: string; costCenterName?: string | null; imprestAmount: number; currentBalance: number }>;
  costCenterLabel: string;
  vendorSuggestions?: string[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [campusId, setCampusId] = useState(expense.costCenterId ?? "__corporate__");
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [amount, setAmount] = useState(String(expense.amount));
  const [expenseDate, setExpenseDate] = useState(parseIsoToDate(expense.expenseDate) ?? new Date());
  const [description, setDescription] = useState(expense.description ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState((expense as any).invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState((expense as any).invoiceDate ? format(new Date((expense as any).invoiceDate), "yyyy-MM-dd") : "");
  const [vendorName, setVendorName] = useState((expense as any).vendorName ?? "");
  const [gstin, setGstin] = useState((expense as any).gstin ?? "");
  const [taxType, setTaxType] = useState((expense as any).taxType ?? "");
  const [voucherNumber, setVoucherNumber] = useState((expense as any).voucherNumber ?? "");
  const [pettyCashFundId, setPettyCashFundId] = useState(expense.pettyCashFundId ?? "");

  const pettyFundsEdit = useMemo(
    () => (campusId && campusId !== "__corporate__" ? pettyCashFunds.filter((f) => f.costCenterId === campusId) : []),
    [campusId, pettyCashFunds]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amount || parseFloat(amount) <= 0) {
      toast({ title: "Validation error", description: "Category and a valid amount are required", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      campusId: (campusId && campusId !== "__corporate__") ? campusId : null,
      categoryId,
      amount: Math.round(parseFloat(amount)),
      expenseDate: format(expenseDate, "yyyy-MM-dd"),
      description: description || undefined,
      invoiceNumber: invoiceNumber || undefined,
      invoiceDate: invoiceDate || undefined,
      vendorName: vendorName || undefined,
      gstin: gstin || undefined,
      taxType: taxType || undefined,
      voucherNumber: voucherNumber || undefined,
    };
    if (expense.status === "draft" || expense.status === "pending_approval") {
      payload.pettyCashFundId = pettyCashFundId || null;
    }
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>{costCenterLabel}</Label>
        <Select
          value={campusId}
          onValueChange={(v) => {
            setCampusId(v);
            setPettyCashFundId("");
          }}
        >
          <SelectTrigger><SelectValue placeholder={costCenterLabel} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__corporate__">Corporate Office</SelectItem>
            {campuses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pettyFundsEdit.length > 0 && (expense.status === "draft" || expense.status === "pending_approval") && (
        <div>
          <Label>Petty cash fund (optional)</Label>
          <Select
            value={pettyCashFundId || "__none__"}
            onValueChange={(v) => setPettyCashFundId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="Not from petty cash" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not from petty cash</SelectItem>
              {pettyFundsEdit.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  ₹{f.imprestAmount.toLocaleString("en-IN")} imprest — ₹{f.currentBalance.toLocaleString("en-IN")} balance
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Category *</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Amount (₹) *</Label>
        <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div>
        <Label>Date *</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(expenseDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <Calendar mode="single" selected={expenseDate} onSelect={(d) => d && setExpenseDate(d)} />
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label>Item Name</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Office Rent March 2025" />
      </div>
      <div>
        <Label>Invoice Number</Label>
        <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g., INV-2025-001" />
      </div>
      <div>
        <Label>Invoice Date</Label>
        <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
      </div>
      <div>
        <Label>Vendor / Supplier Name</Label>
        <Input
          list="vendor-suggestions-edit"
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          placeholder="e.g., ABC Supplies Pvt Ltd"
        />
        <datalist id="vendor-suggestions-edit">
          {vendorSuggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>GSTIN (optional)</Label>
        <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="15-character GSTIN" maxLength={15} />
      </div>
      <div>
        <Label>Tax Type</Label>
        <Select value={taxType || "none"} onValueChange={(v) => setTaxType(v === "none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Select tax treatment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="no_gst">No GST</SelectItem>
            <SelectItem value="gst_itc">GST (ITC availed)</SelectItem>
            <SelectItem value="gst_rcm">GST (Reverse Charge)</SelectItem>
            <SelectItem value="gst_no_itc">GST (No ITC)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Voucher Number</Label>
        <Input value={voucherNumber} onChange={(e) => setVoucherNumber(e.target.value)} placeholder="e.g., VOU-2025-00001" />
      </div>
      <ExpenseAttachmentsPanel expenseId={expense.id} tenantId={tenantId} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CategoryForm({
  category,
  onSave,
  onCancel,
  isPending,
}: {
  category?: ExpenseCategory;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [cashflowLabel, setCashflowLabel] = useState(category?.cashflowLabel ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(category?.displayOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [cashflowSection, setCashflowSection] = useState((category as any)?.cashflowSection ?? "operating_outflow");
  const [pnlSection, setPnlSection] = useState((category as any)?.pnlSection ?? "indirect");
  const [drilldownMode, setDrilldownMode] = useState((category as any)?.drilldownMode ?? "none");
  const [misDisplayLabel, setMisDisplayLabel] = useState((category as any)?.misDisplayLabel ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    onSave({
      name: name.trim(),
      slug: slug.trim().toLowerCase().replace(/\s+/g, "_"),
      cashflowLabel: cashflowLabel.trim() || name.trim(),
      displayOrder: parseInt(displayOrder, 10) || 0,
      isActive,
      cashflowSection,
      pnlSection,
      drilldownMode,
      misDisplayLabel: misDisplayLabel.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent Expenses" />
      </div>
      <div>
        <Label>Slug *</Label>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
          placeholder="e.g. rent_expenses"
          disabled={!!category}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cashflow Section</Label>
          <Select value={cashflowSection} onValueChange={setCashflowSection}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="operating_outflow">Operating Outflow</SelectItem>
              <SelectItem value="investing">Investing</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>P&L Section</Label>
          <Select value={pnlSection} onValueChange={setPnlSection}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="indirect">Indirect</SelectItem>
              <SelectItem value="excluded">Excluded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Drilldown Mode</Label>
        <Select value={drilldownMode} onValueChange={setDrilldownMode}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="by_center">By Cost Center</SelectItem>
            <SelectItem value="by_subcategory">By Subcategory</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>MIS Display Label <span className="text-muted-foreground text-xs">(optional override)</span></Label>
        <Input value={misDisplayLabel} onChange={(e) => setMisDisplayLabel(e.target.value)} placeholder="Leave blank to use Name" />
      </div>
      <div>
        <Label>Display Order</Label>
        <Input type="number" min="0" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} />
      </div>
      {category && (
        <div className="flex items-center gap-2">
          <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="isActive">Active</Label>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
