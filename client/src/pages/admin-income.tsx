import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearchParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  TrendingUp,
  Plus,
  Loader2,
  CalendarIcon,
  Building2,
  IndianRupee,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import type {
  IncomeWithDetails,
  IncomeCategory,
  IncomeType,
  Campus,
} from "@shared/schema";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  bank_import: "Bank Import",
};

export default function AdminIncome() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const { costCenterLabel } = useCostCenterLabel(tenantId);
  const [activeTab, setActiveTab] = useState("list");
  const [filters, setFilters] = useState({
    campusId: "all",
    categoryId: "all",
    startDate: "",
    endDate: "",
  });
  const [createForm, setCreateForm] = useState({
    campusId: "__corporate__",
    categoryId: "",
    amount: "",
    incomeDate: new Date(),
    particulars: "",
    incomeType: "other",
  });
  const [categoryDialog, setCategoryDialog] = useState<{ mode: "add" | "edit"; category?: IncomeCategory } | null>(null);
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<IncomeCategory | null>(null);
  const [editIncomeDialog, setEditIncomeDialog] = useState<IncomeWithDetails | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", particulars: "", incomeType: "other", incomeDate: "" });
  const [viewIncomeDialog, setViewIncomeDialog] = useState<IncomeWithDetails | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", incomeType: "other" as string, displayOrder: 0 });
  const [incomeTypeDialog, setIncomeTypeDialog] = useState<{ mode: "add" | "edit"; type?: IncomeType } | null>(null);
  const [deleteIncomeTypeDialog, setDeleteIncomeTypeDialog] = useState<IncomeType | null>(null);
  const [incomeTypeForm, setIncomeTypeForm] = useState({ slug: "", label: "", displayOrder: 0 });
  const [reconStartDate, setReconStartDate] = useState(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [reconEndDate, setReconEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    if (editIncomeDialog) {
      setEditForm({
        amount: String(editIncomeDialog.amount),
        particulars: editIncomeDialog.particulars || "",
        incomeType: editIncomeDialog.incomeType,
        incomeDate: format(new Date(editIncomeDialog.incomeDate), "yyyy-MM-dd"),
      });
    }
  }, [editIncomeDialog]);

  const LIST_PAGE_SIZE = 100;
  const [incomeOffset, setIncomeOffset] = useState(0);
  const [allIncome, setAllIncome] = useState<IncomeWithDetails[]>([]);

  const buildQueryParams = (offset: number) => {
    const params = new URLSearchParams();
    if (tenantId) params.append("tenantId", tenantId);
    const campusVal = filters.campusId && filters.campusId !== "all" ? filters.campusId : null;
    if (campusVal) params.append("campusId", campusVal === "corporate" || campusVal === "__corporate__" ? "__corporate__" : campusVal);
    if (filters.categoryId && filters.categoryId !== "all") params.append("categoryId", filters.categoryId);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    params.append("limit", String(LIST_PAGE_SIZE));
    params.append("offset", String(offset));
    return params.toString();
  };

  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    setIncomeOffset(0);
    setAllIncome([]);
  }, [filtersKey]);

  const { data: incomeData, isLoading } = useQuery<{ rows: IncomeWithDetails[]; total: number; hasMore: boolean; offset: number }>({
    queryKey: ["/api/admin/income", filters, tenantId, incomeOffset],
    queryFn: async () => {
      const q = buildQueryParams(incomeOffset);
      const res = await fetch(`/api/admin/income?${q}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!incomeData) return;
    if (incomeData.offset === 0) {
      setAllIncome(incomeData.rows);
    } else {
      setAllIncome((prev) => [...prev, ...incomeData.rows]);
    }
  }, [incomeData]);

  const incomeList = allIncome;
  const incomeTotal = incomeData?.total ?? 0;
  const incomeHasMore = incomeData?.hasMore ?? false;

  const { data: categories = [] } = useQuery<IncomeCategory[]>({
    queryKey: ["/api/admin/income-categories", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-categories${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: categoriesForAdmin = [] } = useQuery<IncomeCategory[]>({
    queryKey: ["/api/admin/income-categories", "admin", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-categories?includeInactive=true${tenantId ? `&tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: incomeTypesList = [] } = useQuery<IncomeType[]>({
    queryKey: ["/api/admin/income-types", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-types${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const incomeTypeLabel = (slug: string) => incomeTypesList.find((t) => t.slug === slug)?.label ?? slug;

  const qs = tenantId ? `?tenantId=${tenantId}` : "";
  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/campuses", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/campuses${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/income", { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      setIncomeOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
      setCreateForm({ campusId: "__corporate__", categoryId: "", amount: "", incomeDate: new Date(), particulars: "", incomeType: "other" });
      setActiveTab("list");
      toast({ title: "Income created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateIncomeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/income/${id}`, { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      setIncomeOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
      setEditIncomeDialog(null);
      toast({ title: "Income updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const body = { ...data };
      if (tenantId) body.tenantId = tenantId;
      const res = await apiRequest("POST", "/api/admin/income-categories", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-categories"] });
      setCategoryDialog(null);
      setCategoryForm({ name: "", slug: "", incomeType: "other", displayOrder: 0 });
      toast({ title: "Category created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const body = { ...data };
      if (tenantId) body.tenantId = tenantId;
      const res = await apiRequest("PATCH", `/api/admin/income-categories/${id}`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-categories"] });
      setCategoryDialog(null);
      toast({ title: "Category updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/admin/income-categories/${id}${tenantId ? `?tenantId=${tenantId}` : ""}`;
      const res = await apiRequest("DELETE", url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-categories"] });
      setDeleteCategoryDialog(null);
      toast({ title: "Category deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createIncomeTypeMutation = useMutation({
    mutationFn: async (data: { slug: string; label: string; displayOrder?: number }) => {
      const res = await apiRequest("POST", "/api/admin/income-types", { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-types"] });
      setIncomeTypeDialog(null);
      setIncomeTypeForm({ slug: "", label: "", displayOrder: 0 });
      toast({ title: "Income type created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateIncomeTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { slug?: string; label?: string; displayOrder?: number } }) => {
      const res = await apiRequest("PATCH", `/api/admin/income-types/${id}`, { ...data, tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-types"] });
      setIncomeTypeDialog(null);
      toast({ title: "Income type updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteIncomeTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/admin/income-types/${id}${tenantId ? `?tenantId=${tenantId}` : ""}`;
      const res = await apiRequest("DELETE", url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-types"] });
      setDeleteIncomeTypeDialog(null);
      toast({ title: "Income type deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const seedIncomeTypesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/income-types/seed", { tenantId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to seed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income-types"] });
      toast({ title: "Income types seeded", description: `${data.seeded} of ${data.total} added` });
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
      incomeDate: format(createForm.incomeDate, "yyyy-MM-dd"),
      particulars: createForm.particulars || undefined,
      incomeType: createForm.incomeType,
    });
  };

  const totalIncome = incomeList.reduce((sum, i) => sum + (i.amount || 0), 0);

  const [suggestionsRequested, setSuggestionsRequested] = useState(false);
  const { data: reconciliation, isLoading: reconLoading } = useQuery<{
    totalIncome: number;
    totalExpenses: number;
    bankNet: number;
    unmappedIncomeCount: number;
    unmappedIncomeAmount: number;
    incomeCount: number;
    expenseCount: number;
  }>({
    queryKey: ["/api/admin/reconciliation", reconStartDate, reconEndDate, tenantId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: reconStartDate, endDate: reconEndDate });
      if (tenantId) params.append("tenantId", tenantId);
      const res = await fetch(`/api/admin/reconciliation?${params}`, { credentials: "include" });
      if (!res.ok) return { totalIncome: 0, totalExpenses: 0, bankNet: 0, unmappedIncomeCount: 0, unmappedIncomeAmount: 0, incomeCount: 0, expenseCount: 0 };
      return res.json();
    },
    enabled: activeTab === "reconciliation" && !!tenantId,
    retry: false,
  });

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{
    suggestions: Array<{
      incomeId: string;
      expenseId: string;
      incomeAmount: number;
      expenseAmount: number;
      reason: string;
      confidence: string;
    }>;
  }>({
    queryKey: ["/api/admin/reconciliation/suggestions", reconStartDate, reconEndDate, tenantId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: reconStartDate, endDate: reconEndDate });
      if (tenantId) params.append("tenantId", tenantId);
      const res = await fetch(`/api/admin/reconciliation/suggestions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "reconciliation" && !!tenantId && suggestionsRequested,
    retry: false,
  });

  if (!tenantId) {
    return (
      <div className="container max-w-7xl py-8">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {isSuperAdmin ? "Select a tenant to manage income." : "Tenant context required."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/finjoe">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Income Management
            </CardTitle>
            <CardDescription>
              Manage income (deposits, fee receipts). Import from bank CSV via Expenses → Import. Use Reconciliation tab for income vs expenses summary.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="income-types">Income Types</TabsTrigger>
              <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            </TabsList>

            <TabsContent value="list">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Select value={filters.campusId} onValueChange={(v) => setFilters((f) => ({ ...f, campusId: v }))}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={costCenterLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {costCenterLabel}s</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                      {campuses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.categoryId} onValueChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}>
                    <SelectTrigger className="w-[180px]">
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

                <p className="text-sm text-muted-foreground">
                  Total: {incomeList.length}{incomeHasMore ? ` of ${incomeTotal}` : ""} records, ₹ {totalIncome.toLocaleString("en-IN")}
                </p>

                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Particulars</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>{costCenterLabel}</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeList.map((inc) => (
                        <TableRow key={inc.id}>
                          <TableCell>{format(new Date(inc.incomeDate), "dd MMM yyyy")}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={inc.particulars || undefined}>
                            {inc.particulars || "—"}
                          </TableCell>
                          <TableCell>{inc.category?.name || "-"}</TableCell>
                          <TableCell>{inc.campus?.name || "Corporate"}</TableCell>
                          <TableCell>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              ₹ {(inc.amount / 1).toLocaleString("en-IN")}
                            </span>
                          </TableCell>
                          <TableCell>{incomeTypeLabel(inc.incomeType)}</TableCell>
                          <TableCell>{SOURCE_LABELS[inc.source] || inc.source}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewIncomeDialog(inc)}
                              >
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditIncomeDialog(inc)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {incomeHasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIncomeOffset((o) => o + LIST_PAGE_SIZE)}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Load more (${incomeList.length} of ${incomeTotal} shown)`}
                    </Button>
                  </div>
                )}

                {!isLoading && incomeList.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No income records. Import from bank CSV via{" "}
                    <Link href="/admin/expenses">
                      <Button variant="link" className="p-0 h-auto">Expenses → Import</Button>
                    </Link>
                    , or create manually.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="create">
              <form onSubmit={handleCreate} className="space-y-4 max-w-md">
                <div>
                  <Label>{costCenterLabel}</Label>
                  <Select
                    value={createForm.campusId}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, campusId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${costCenterLabel.toLowerCase()} (optional)`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__corporate__">Corporate</SelectItem>
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
                  <Label>Income Type</Label>
                  <Select
                    value={createForm.incomeType}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, incomeType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incomeTypesList.map((t) => (
                        <SelectItem key={t.id} value={t.slug}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Particulars</Label>
                  <Input
                    value={createForm.particulars}
                    onChange={(e) => setCreateForm((f) => ({ ...f, particulars: e.target.value }))}
                    placeholder="e.g., Fee from John Doe"
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
                        className={cn("w-full justify-start", !createForm.incomeDate && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {createForm.incomeDate
                          ? format(createForm.incomeDate, "PPP")
                          : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <Calendar
                        mode="single"
                        selected={createForm.incomeDate}
                        onSelect={(d) => d && setCreateForm((f) => ({ ...f, incomeDate: d }))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Income"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="categories">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Manage income categories. Categories with income records cannot be deleted.
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
                      <TableHead>Income Type</TableHead>
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
                        <TableCell>{incomeTypeLabel(c.incomeType)}</TableCell>
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
                              onClick={() => {
                                setCategoryDialog({ mode: "edit", category: c });
                                setCategoryForm({ name: c.name, slug: c.slug, incomeType: c.incomeType, displayOrder: c.displayOrder });
                              }}
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
                    No categories. Default categories are seeded from migration.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="income-types">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Configure income types for this tenant (e.g. Registration Fee, Product Sales, Consulting).
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => seedIncomeTypesMutation.mutate()}
                      disabled={seedIncomeTypesMutation.isPending}
                    >
                      {seedIncomeTypesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Seed Defaults"}
                    </Button>
                    <Button onClick={() => setIncomeTypeDialog({ mode: "add" })}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Type
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slug</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeTypesList.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-sm">{t.slug}</TableCell>
                        <TableCell className="font-medium">{t.label}</TableCell>
                        <TableCell>{t.displayOrder}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setIncomeTypeDialog({ mode: "edit", type: t });
                                setIncomeTypeForm({ slug: t.slug, label: t.label, displayOrder: t.displayOrder });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteIncomeTypeDialog(t)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {incomeTypesList.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No income types. Click &quot;Seed Defaults&quot; to add education-institute defaults, or add custom types.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="reconciliation">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={reconStartDate}
                      onChange={(e) => setReconStartDate(e.target.value)}
                      className="w-[150px]"
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={reconEndDate}
                      onChange={(e) => setReconEndDate(e.target.value)}
                      className="w-[150px]"
                    />
                  </div>
                </div>
                {reconLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : reconciliation ? (
                  <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          ₹ {reconciliation.totalIncome.toLocaleString("en-IN")}
                        </div>
                        <p className="text-xs text-muted-foreground">{reconciliation.incomeCount} records</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses (Paid)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                          ₹ {reconciliation.totalExpenses.toLocaleString("en-IN")}
                        </div>
                        <p className="text-xs text-muted-foreground">{reconciliation.expenseCount} records</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Bank Net</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className={cn(
                          "text-2xl font-bold",
                          reconciliation.bankNet >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          ₹ {reconciliation.bankNet.toLocaleString("en-IN")}
                        </div>
                        <p className="text-xs text-muted-foreground">Income − Expenses</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Income in Period</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          ₹ {reconciliation.unmappedIncomeAmount.toLocaleString("en-IN")}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {reconciliation.unmappedIncomeCount} records —{" "}
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => {
                              setFilters((f) => ({ ...f, startDate: reconStartDate, endDate: reconEndDate }));
                              setActiveTab("list");
                            }}
                          >
                            View list
                          </button>
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="mt-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSuggestionsRequested(true)}
                        disabled={suggestionsLoading}
                      >
                        {suggestionsLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Get AI match suggestions
                      </Button>
                    </div>
                    {suggestionsData?.suggestions && suggestionsData.suggestions.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">AI-suggested matches</CardTitle>
                          <CardDescription>Plausible income-expense pairs (review before applying)</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2 text-sm">
                            {suggestionsData.suggestions.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 p-2 rounded border">
                                <Badge variant={s.confidence === "high" ? "default" : "secondary"}>{s.confidence}</Badge>
                                <span>
                                  Income ₹{s.incomeAmount.toLocaleString("en-IN")} ↔ Expense ₹{s.expenseAmount.toLocaleString("en-IN")}
                                  {" — "}
                                  <span className="text-muted-foreground">{s.reason}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    {suggestionsRequested && suggestionsData?.suggestions?.length === 0 && !suggestionsLoading && (
                      <p className="text-sm text-muted-foreground">No AI suggestions found. GEMINI_API_KEY may be unset, or no clear matches in the data.</p>
                    )}
                  </div>
                  </>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Income Dialog */}
      <Dialog open={!!viewIncomeDialog} onOpenChange={() => setViewIncomeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Income Details</DialogTitle>
          </DialogHeader>
          {viewIncomeDialog && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Date:</span> {format(new Date(viewIncomeDialog.incomeDate), "PPP")}</p>
              <p><span className="font-medium">Amount:</span> ₹ {viewIncomeDialog.amount.toLocaleString("en-IN")}</p>
              <p><span className="font-medium">Category:</span> {viewIncomeDialog.category?.name || "-"}</p>
              <p><span className="font-medium">Type:</span> {incomeTypeLabel(viewIncomeDialog.incomeType)}</p>
              <p><span className="font-medium">Source:</span> {SOURCE_LABELS[viewIncomeDialog.source] || viewIncomeDialog.source}</p>
              <p><span className="font-medium">{costCenterLabel}:</span> {viewIncomeDialog.campus?.name || "Corporate"}</p>
              <p><span className="font-medium">Particulars:</span> {viewIncomeDialog.particulars || "—"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Income Dialog */}
      <Dialog open={!!editIncomeDialog} onOpenChange={(open) => !open && setEditIncomeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Income</DialogTitle>
          </DialogHeader>
          {editIncomeDialog && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editForm.amount || parseFloat(editForm.amount) <= 0) {
                  toast({ title: "Error", description: "Amount required", variant: "destructive" });
                  return;
                }
                updateIncomeMutation.mutate({
                  id: editIncomeDialog.id,
                  data: {
                    amount: Math.round(parseFloat(editForm.amount)),
                    particulars: editForm.particulars || undefined,
                    incomeType: editForm.incomeType,
                    incomeDate: editForm.incomeDate,
                  },
                });
              }}
              className="space-y-4"
            >
              <div>
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  min="1"
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
                <Select
                  value={editForm.incomeType}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, incomeType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeTypesList.map((t) => (
                      <SelectItem key={t.id} value={t.slug}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editForm.incomeDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, incomeDate: e.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditIncomeDialog(null)}>Cancel</Button>
                <Button type="submit" disabled={updateIncomeMutation.isPending}>
                  {updateIncomeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Add/Edit Dialog */}
      <Dialog open={!!categoryDialog} onOpenChange={() => setCategoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialog?.mode === "add" ? "Add Category" : "Edit Category"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (categoryDialog?.mode === "add") {
                createCategoryMutation.mutate({
                  ...categoryForm,
                  displayOrder: categoryForm.displayOrder,
                  isActive: true,
                });
              } else if (categoryDialog?.category) {
                updateCategoryMutation.mutate({
                  id: categoryDialog.category.id,
                  data: { ...categoryForm, displayOrder: categoryForm.displayOrder },
                });
              }
            }}
            className="space-y-4"
          >
            <div>
              <Label>Name</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                placeholder="e.g., Registration Fee"
                required
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={categoryForm.slug}
                onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g., registration_fee"
                required
              />
            </div>
            <div>
              <Label>Income Type</Label>
              <Select
                value={categoryForm.incomeType}
                onValueChange={(v) => setCategoryForm((f) => ({ ...f, incomeType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {incomeTypesList.map((t) => (
                        <SelectItem key={t.id} value={t.slug}>{t.label}</SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                min="0"
                value={categoryForm.displayOrder}
                onChange={(e) => setCategoryForm((f) => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}>
                {(createCategoryMutation.isPending || updateCategoryMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Income Type Dialog */}
      <Dialog open={!!incomeTypeDialog} onOpenChange={() => setIncomeTypeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{incomeTypeDialog?.mode === "edit" ? "Edit Income Type" : "Add Income Type"}</DialogTitle>
            <DialogDescription>
              Income types categorize income records. Slug is used in data; label is shown to users.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!incomeTypeForm.slug.trim() || !incomeTypeForm.label.trim()) {
                toast({ title: "Error", description: "Slug and label required", variant: "destructive" });
                return;
              }
              if (incomeTypeDialog?.mode === "edit" && incomeTypeDialog.type) {
                updateIncomeTypeMutation.mutate({ id: incomeTypeDialog.type.id, data: incomeTypeForm });
              } else {
                createIncomeTypeMutation.mutate(incomeTypeForm);
              }
            }}
            className="space-y-4"
          >
            <div>
              <Label>Slug</Label>
              <Input
                value={incomeTypeForm.slug}
                onChange={(e) => setIncomeTypeForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                placeholder="e.g., product_sales"
                required
                disabled={incomeTypeDialog?.mode === "edit"}
              />
            </div>
            <div>
              <Label>Label</Label>
              <Input
                value={incomeTypeForm.label}
                onChange={(e) => setIncomeTypeForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g., Product Sales"
                required
              />
            </div>
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                min="0"
                value={incomeTypeForm.displayOrder}
                onChange={(e) => setIncomeTypeForm((f) => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIncomeTypeDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={createIncomeTypeMutation.isPending || updateIncomeTypeMutation.isPending}>
                {(createIncomeTypeMutation.isPending || updateIncomeTypeMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Income Type Dialog */}
      <Dialog open={!!deleteIncomeTypeDialog} onOpenChange={() => setDeleteIncomeTypeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Income Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteIncomeTypeDialog?.label}&quot;? Income records using this type will keep the slug but may show it as raw text until you add a type with the same slug.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteIncomeTypeDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteIncomeTypeDialog && deleteIncomeTypeMutation.mutate(deleteIncomeTypeDialog.id)}
              disabled={deleteIncomeTypeMutation.isPending}
            >
              {deleteIncomeTypeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <Dialog open={!!deleteCategoryDialog} onOpenChange={() => setDeleteCategoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteCategoryDialog?.name}&quot;? Categories with income records cannot be deleted.
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
