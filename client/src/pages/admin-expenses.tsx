import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Upload,
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
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type {
  ExpenseWithDetails,
  ExpenseCategory,
  Campus,
} from "@shared/schema";

function ExpenseImportWizard({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    preview: Array<{ date: string; particulars: string; amount: number; majorHead: string; branch: string; categoryMatch: string }>;
    totalRows: number;
    totalAmount: number;
    incomePreview?: Array<{ date: string; particulars: string; amount: number; categoryMatch: string }>;
    incomeTotalRows?: number;
    incomeTotalAmount?: number;
    skippedZero?: number;
  } | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/admin/expenses/import/preview", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Preview failed");
      return res.json();
    },
    onSuccess: (data) => setPreview(data),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/admin/expenses/import/execute", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      const msg = data.incomeImported > 0
        ? `${data.imported} expenses, ${data.incomeImported} income imported`
        : `${data.imported} expenses imported`;
      toast({ title: "Import complete", description: msg });
      setFile(null);
      setPreview(null);
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Upload CSV</Label>
        <Input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFile(f);
              setPreview(null);
              previewMutation.mutate(f);
            }
          }}
        />
      </div>
      {previewMutation.isPending && <p className="text-sm text-muted-foreground">Analyzing...</p>}
      {preview && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {preview.totalRows} expense rows (withdrawals), total ₹ {preview.totalAmount.toLocaleString("en-IN")}
          </p>
          {preview.incomeTotalRows !== undefined && preview.incomeTotalRows > 0 && (
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              {preview.incomeTotalRows} income rows (deposits), total ₹ {preview.incomeTotalAmount?.toLocaleString("en-IN") ?? 0}
            </p>
          )}
          {preview.skippedZero !== undefined && preview.skippedZero > 0 && (
            <p className="text-xs text-muted-foreground">Skipped: {preview.skippedZero} zero/empty rows</p>
          )}
          <div className="max-h-48 overflow-auto border rounded p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.preview.slice(0, 10).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.particulars}</TableCell>
                    <TableCell>₹ {r.amount.toLocaleString("en-IN")}</TableCell>
                    <TableCell>{r.categoryMatch}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.incomePreview && preview.incomePreview.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Income (deposits) preview</p>
              <div className="max-h-32 overflow-auto border rounded p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.incomePreview.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.particulars}</TableCell>
                        <TableCell className="text-green-600">₹ {r.amount.toLocaleString("en-IN")}</TableCell>
                        <TableCell>{r.categoryMatch}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <Button
            onClick={() => file && executeMutation.mutate(file)}
            disabled={executeMutation.isPending || !file}
          >
            {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PettyCashTab({
  funds,
  students,
  campuses,
  approvedExpenses,
  onCreateFund,
  onCreateReplenishment,
  isCreateFundPending,
  isCreateReplenishmentPending,
}: {
  funds: Array<{ id: string; campusId: string; custodianId: string; imprestAmount: number; currentBalance: number }>;
  students: Array<{ id: string; name?: string; email: string }>;
  campuses: Campus[];
  approvedExpenses: ExpenseWithDetails[];
  onCreateFund: (data: { campusId: string; custodianId: string; imprestAmount: number }) => void;
  onCreateReplenishment: (data: { fundId: string; expenseIds: string[]; payoutMethod: string; payoutRef: string }) => void;
  isCreateFundPending: boolean;
  isCreateReplenishmentPending: boolean;
}) {
  const [fundDialog, setFundDialog] = useState(false);
  const [fundForm, setFundForm] = useState({ campusId: "", custodianId: "", imprestAmount: "" });
  const [replenishDialog, setReplenishDialog] = useState<{ fundId: string } | null>(null);
  const [replenishForm, setReplenishForm] = useState({ payoutMethod: "bank_transfer", payoutRef: "" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const campusById = new Map(campuses.map((c) => [c.id, c]));
  const studentById = new Map(students.map((s) => [s.id, s]));

  const handleCreateFund = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(fundForm.imprestAmount, 10);
    if (!fundForm.campusId || !fundForm.custodianId || isNaN(amt) || amt < 0) return;
    onCreateFund({ campusId: fundForm.campusId, custodianId: fundForm.custodianId, imprestAmount: amt });
    setFundForm({ campusId: "", custodianId: "", imprestAmount: "" });
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
    if (selectedIds.size === approvedExpenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(approvedExpenses.map((e) => e.id)));
  };

  const selectedTotal = approvedExpenses
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
            Manage imprest funds per campus and custodian. Record replenishments when coordinators submit approved expenses.
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
                <TableHead>Campus</TableHead>
                <TableHead>Custodian</TableHead>
                <TableHead>Imprest (₹)</TableHead>
                <TableHead>Balance (₹)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funds.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{campusById.get(f.campusId)?.name ?? f.campusId}</TableCell>
                  <TableCell>{(studentById.get(f.custodianId)?.name || studentById.get(f.custodianId)?.email) ?? f.custodianId}</TableCell>
                  <TableCell>₹ {f.imprestAmount.toLocaleString("en-IN")}</TableCell>
                  <TableCell>₹ {f.currentBalance.toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReplenishDialog({ fundId: f.id })}
                      disabled={approvedExpenses.length === 0}
                    >
                      Replenish
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
            <DialogDescription>Set up an imprest fund for a campus custodian.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFund} className="space-y-4">
            <div>
              <Label>Campus *</Label>
              <Select value={fundForm.campusId} onValueChange={(v) => setFundForm((f) => ({ ...f, campusId: v }))} required>
                <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => (
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
                  {students.map((s) => (
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
              Select approved expenses to include in this replenishment. Enter UTR/transaction reference after payment.
            </DialogDescription>
          </DialogHeader>
          {replenishDialog && (
            <>
              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedIds.size === approvedExpenses.length ? "Deselect all" : "Select all"}
                </Button>
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
                      {approvedExpenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(e.id)}
                              onChange={() => toggleSelect(e.id)}
                            />
                          </TableCell>
                          <TableCell>{format(new Date(e.expenseDate), "dd MMM yyyy")}</TableCell>
                          <TableCell>{e.description || e.particulars || "—"}</TableCell>
                          <TableCell>₹ {e.amount.toLocaleString("en-IN")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-sm font-medium">Selected total: ₹ {selectedTotal.toLocaleString("en-IN")}</p>
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
  const { canApproveExpenses, canImportExpenses } = useAuth();
  const [activeTab, setActiveTab] = useState("list");
  const [filters, setFilters] = useState({
    campusId: "all",
    status: "all",
    categoryId: "all",
    source: "all",
    startDate: "",
    endDate: "",
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
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.campusId && filters.campusId !== "all") params.append("campusId", filters.campusId);
    if (filters.status && filters.status !== "all") params.append("status", filters.status);
    if (filters.categoryId && filters.categoryId !== "all") params.append("categoryId", filters.categoryId);
    if (filters.source && filters.source !== "all") params.append("source", filters.source);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    return params.toString();
  };

  const { data: expenses = [], isLoading } = useQuery<ExpenseWithDetails[]>({
    queryKey: ["/api/admin/expenses", filters],
    queryFn: async () => {
      const q = buildQueryParams();
      const res = await fetch(`/api/admin/expenses${q ? `?${q}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories"],
  });

  const { data: categoriesForAdmin = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories", "admin"],
    queryFn: async () => {
      const res = await fetch("/api/admin/expense-categories?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: pettyCashFunds = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/petty-cash/funds"],
    queryFn: async () => {
      const res = await fetch("/api/admin/petty-cash/funds");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: canImportExpenses,
  });

  const { data: studentsForAdmin = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/petty-cash/custodians"],
    queryFn: async () => {
      const res = await fetch("/api/admin/petty-cash/custodians");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: canImportExpenses,
  });

  const createFundMutation = useMutation({
    mutationFn: async (data: { campusId: string; custodianId: string; imprestAmount: number }) => {
      const res = await apiRequest("POST", "/api/admin/petty-cash/funds", data);
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
      const res = await apiRequest("POST", "/api/admin/petty-cash/replenishments", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create replenishment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/petty-cash/replenishments"] });
      toast({ title: "Replenishment recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/expense-categories/seed", {});
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
      const res = await apiRequest("POST", "/api/admin/expenses", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setCreateForm({ campusId: "__corporate__", categoryId: "", amount: "", expenseDate: new Date(), description: "", invoiceNumber: "", invoiceDate: "", vendorName: "", gstin: "", taxType: "", voucherNumber: "" });
      setActiveTab("list");
      toast({ title: "Expense created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/submit`, {});
      if (!res.ok) throw new Error("Failed to submit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setActionMenu(null);
      toast({ title: "Expense submitted" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/approve`, {});
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setApproveDialog(null);
      toast({ title: "Expense approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/reject`, { reason });
      if (!res.ok) throw new Error("Failed to reject");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setRejectDialog(null);
      toast({ title: "Expense rejected" });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: async ({ id, payoutMethod, payoutRef }: { id: string; payoutMethod: string; payoutRef: string }) => {
      const res = await apiRequest("POST", `/api/admin/expenses/${id}/payout`, { payoutMethod, payoutRef });
      if (!res.ok) throw new Error("Failed to record payout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setPayoutDialog(null);
      toast({ title: "Payout recorded" });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/expenses/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setEditExpenseDialog(null);
      toast({ title: "Expense updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/expenses/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setDeleteExpenseDialog(null);
      toast({ title: "Expense deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; cashflowLabel: string; displayOrder?: number }) => {
      const res = await apiRequest("POST", "/api/admin/expense-categories", data);
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
      const res = await apiRequest("PATCH", `/api/admin/expense-categories/${id}`, data);
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
      const res = await apiRequest("DELETE", `/api/admin/expense-categories/${id}`);
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
    createMutation.mutate({
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
      status: "draft",
    });
  };

  const handleExport = () => {
    if (!exportStart || !exportEnd) {
      toast({ title: "Select date range", description: "Start and end dates are required for export.", variant: "destructive" });
      return;
    }
    const params = new URLSearchParams();
    params.append("startDate", format(exportStart, "yyyy-MM-dd"));
    params.append("endDate", format(exportEnd, "yyyy-MM-dd"));
    window.open(`/api/admin/expenses/export?${params.toString()}`, "_blank");
    toast({ title: "Export started" });
  };

  return (
    <div className="container max-w-7xl py-8">
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
            <Link href="/admin/income">
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
              {canImportExpenses && <TabsTrigger value="import">Import</TabsTrigger>}
              {canImportExpenses && <TabsTrigger value="export">Export</TabsTrigger>}
              {canImportExpenses && <TabsTrigger value="petty-cash">Petty Cash</TabsTrigger>}
            </TabsList>

            <TabsContent value="list">
              <div className="space-y-4">
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
                      <SelectValue placeholder="Campus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Campuses</SelectItem>
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
                          <TableCell>{format(new Date(exp.expenseDate), "dd MMM yyyy")}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={exp.description || exp.particulars || undefined}>
                            {exp.description || exp.particulars || "—"}
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
                            <Badge variant={STATUS_BADGES[exp.status]?.variant || "outline"}>
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
                                  {exp.status === "draft" && (
                                    <>
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
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, campusId: v }))}
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
                    value={createForm.vendorName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, vendorName: e.target.value }))}
                    placeholder="e.g., ABC Supplies Pvt Ltd"
                  />
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

            <TabsContent value="import">
              <Card>
                <CardHeader>
                  <CardTitle>Import Bank Statement</CardTitle>
                  <CardDescription>
                    Upload a CSV export of your bank statement. Supported format: Date, Particulars, Withdrawals,
                    Deposits, A/C, Major Head, Branch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const res = await fetch("/api/admin/expenses/import/template");
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "expense-import-template.csv";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Template
                    </Button>
                  </div>
                  <ExpenseImportWizard
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
                      setActiveTab("list");
                    }}
                  />
                </CardContent>
              </Card>
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

            {canImportExpenses && (
              <TabsContent value="petty-cash">
                <PettyCashTab
                  funds={pettyCashFunds}
                  students={studentsForAdmin}
                  campuses={campuses}
                  approvedExpenses={expenses.filter((e) => e.status === "approved")}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
            <DialogDescription>View all expense and documentation fields.</DialogDescription>
          </DialogHeader>
          {viewExpenseDialog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-medium">{format(new Date(viewExpenseDialog.expenseDate), "dd MMM yyyy")}</p>
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
                {(viewExpenseDialog.status === "paid" && (viewExpenseDialog.payoutRef || (viewExpenseDialog as any).replenishmentId)) && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">UTR / Payout Reference</span>
                    <p className="font-medium">{viewExpenseDialog.payoutRef || "—"}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewExpenseDialog(null)}>Close</Button>
                {viewExpenseDialog.status === "draft" && (
                  <Button onClick={() => { setEditExpenseDialog(viewExpenseDialog); setViewExpenseDialog(null); }}>
                    Edit
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editExpenseDialog} onOpenChange={() => setEditExpenseDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>Update draft expense details.</DialogDescription>
          </DialogHeader>
          {editExpenseDialog && (
            <EditExpenseForm
              expense={editExpenseDialog}
              categories={categories}
              campuses={campuses}
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
  categories,
  campuses,
  onSave,
  onCancel,
  isPending,
}: {
  expense: ExpenseWithDetails;
  categories: ExpenseCategory[];
  campuses: Campus[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [campusId, setCampusId] = useState(expense.campusId ?? "__corporate__");
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [amount, setAmount] = useState(String(expense.amount));
  const [expenseDate, setExpenseDate] = useState(new Date(expense.expenseDate));
  const [description, setDescription] = useState(expense.description ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState((expense as any).invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState((expense as any).invoiceDate ? format(new Date((expense as any).invoiceDate), "yyyy-MM-dd") : "");
  const [vendorName, setVendorName] = useState((expense as any).vendorName ?? "");
  const [gstin, setGstin] = useState((expense as any).gstin ?? "");
  const [taxType, setTaxType] = useState((expense as any).taxType ?? "");
  const [voucherNumber, setVoucherNumber] = useState((expense as any).voucherNumber ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amount || parseFloat(amount) <= 0) {
      toast({ title: "Validation error", description: "Category and a valid amount are required", variant: "destructive" });
      return;
    }
    onSave({
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
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Campus</Label>
        <Select value={campusId} onValueChange={setCampusId}>
          <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__corporate__">Corporate Office</SelectItem>
            {campuses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
        <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g., ABC Supplies Pvt Ltd" />
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
  onSave: (data: { name: string; slug: string; cashflowLabel: string; displayOrder?: number; isActive?: boolean }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [cashflowLabel, setCashflowLabel] = useState(category?.cashflowLabel ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(category?.displayOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !cashflowLabel.trim()) return;
    onSave({
      name: name.trim(),
      slug: slug.trim().toLowerCase().replace(/\s+/g, "_"),
      cashflowLabel: cashflowLabel.trim(),
      displayOrder: parseInt(displayOrder, 10) || 0,
      isActive,
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
      <div>
        <Label>Cashflow Label *</Label>
        <Input value={cashflowLabel} onChange={(e) => setCashflowLabel(e.target.value)} placeholder="MIS export label" />
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
