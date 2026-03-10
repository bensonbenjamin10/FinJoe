import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  Link2,
  Unlink,
  ArrowLeft,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  IncomeWithDetails,
  IncomeCategory,
  Campus,
  RegistrationWithDetails,
} from "@shared/schema";

const INCOME_TYPE_LABELS: Record<string, string> = {
  registration_fee: "Registration Fee",
  remaining_fee: "Remaining Fee",
  hostel_fee: "Hostel Fee",
  other: "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  bank_import: "Bank Import",
};

export default function AdminIncome() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("list");
  const [filters, setFilters] = useState({
    campusId: "all",
    categoryId: "all",
    startDate: "",
    endDate: "",
    mapped: "all",
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
  const [mapIncomeDialog, setMapIncomeDialog] = useState<IncomeWithDetails | null>(null);
  const [mapSearch, setMapSearch] = useState("");
  const [mapIncomeType, setMapIncomeType] = useState<"registration_fee" | "remaining_fee" | "hostel_fee">("registration_fee");
  const [mapRegistrationId, setMapRegistrationId] = useState<string>("");
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", incomeType: "other" as string, displayOrder: 0 });
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

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.campusId && filters.campusId !== "all") params.append("campusId", filters.campusId === "corporate" ? "null" : filters.campusId);
    if (filters.categoryId && filters.categoryId !== "all") params.append("categoryId", filters.categoryId);
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.mapped && filters.mapped !== "all") params.append("mapped", filters.mapped);
    return params.toString();
  };

  const { data: incomeList = [], isLoading } = useQuery<IncomeWithDetails[]>({
    queryKey: ["/api/admin/income", filters],
    queryFn: async () => {
      const q = buildQueryParams();
      const res = await fetch(`/api/admin/income${q ? `?${q}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<IncomeCategory[]>({
    queryKey: ["/api/admin/income-categories"],
  });

  const { data: categoriesForAdmin = [] } = useQuery<IncomeCategory[]>({
    queryKey: ["/api/admin/income-categories", "admin"],
    queryFn: async () => {
      const res = await fetch("/api/admin/income-categories?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: suggestionsData } = useQuery<{ suggestions: Array<{ registration: RegistrationWithDetails; score: number; reason: string }> }>({
    queryKey: ["/api/admin/income/suggestions", mapIncomeDialog?.id],
    queryFn: async () => {
      if (!mapIncomeDialog) return { suggestions: [] };
      const res = await fetch(`/api/admin/income/${mapIncomeDialog.id}/suggestions`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!mapIncomeDialog,
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  const { data: registrations = [] } = useQuery<RegistrationWithDetails[]>({
    queryKey: ["/api/admin/registrations", mapSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mapSearch.trim()) params.append("search", mapSearch.trim());
      const res = await fetch(`/api/admin/registrations${params.toString() ? `?${params.toString()}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!mapIncomeDialog && mapSearch.trim().length >= 2,
  });

  const mapMutation = useMutation({
    mutationFn: async ({ incomeId, registrationId, incomeType }: { incomeId: string; registrationId: string; incomeType: string }) => {
      const res = await apiRequest("POST", `/api/admin/income/${incomeId}/map`, { registrationId, incomeType });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to map");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
      setMapIncomeDialog(null);
      setMapSearch("");
      setMapRegistrationId("");
      toast({ title: "Income mapped to student" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/income", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
      setCreateForm({ campusId: "__corporate__", categoryId: "", amount: "", incomeDate: new Date(), particulars: "", incomeType: "other" });
      setActiveTab("list");
      toast({ title: "Income created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateIncomeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/income/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
      setEditIncomeDialog(null);
      toast({ title: "Income updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/income-categories", data);
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
      const res = await apiRequest("PATCH", `/api/admin/income-categories/${id}`, data);
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
      const res = await apiRequest("DELETE", `/api/admin/income-categories/${id}`);
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

  const { data: reconciliation, isLoading: reconLoading } = useQuery<{
    totalIncome: number;
    totalExpenses: number;
    bankNet: number;
    unmappedIncomeCount: number;
    unmappedIncomeAmount: number;
    incomeCount: number;
    expenseCount: number;
  }>({
    queryKey: ["/api/admin/reconciliation", reconStartDate, reconEndDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: reconStartDate, endDate: reconEndDate });
      const res = await fetch(`/api/admin/reconciliation?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "reconciliation",
  });

  return (
    <div className="container max-w-7xl py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/expenses">
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
              Manage income (deposits, fee receipts). Import from bank CSV via Expenses → Import. Map income to students for reconciliation.
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
              <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            </TabsList>

            <TabsContent value="list">
              <div className="space-y-4">
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
                  <Select value={filters.mapped} onValueChange={(v) => setFilters((f) => ({ ...f, mapped: v }))}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="true">Mapped</SelectItem>
                      <SelectItem value="false">Unmapped</SelectItem>
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
                  Total: {incomeList.length} records, ₹ {totalIncome.toLocaleString("en-IN")}
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
                        <TableHead>Campus</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Mapped</TableHead>
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
                          <TableCell>{inc.campus?.name || "Corporate Office"}</TableCell>
                          <TableCell>
                            <span className="font-medium text-green-600 dark:text-green-400">
                              ₹ {(inc.amount / 1).toLocaleString("en-IN")}
                            </span>
                          </TableCell>
                          <TableCell>{INCOME_TYPE_LABELS[inc.incomeType] || inc.incomeType}</TableCell>
                          <TableCell>{SOURCE_LABELS[inc.source] || inc.source}</TableCell>
                          <TableCell>
                            {inc.registrationId ? (
                              <Badge variant="default" className="gap-1">
                                <Link2 className="h-3 w-3" />
                                Mapped
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <Unlink className="h-3 w-3" />
                                Unmapped
                              </Badge>
                            )}
                          </TableCell>
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
                              {!inc.registrationId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setMapIncomeDialog(inc);
                                    setMapRegistrationId("");
                                    setMapSearch("");
                                  }}
                                  title="Map to student"
                                >
                                  <Link2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                  <Label>Income Type</Label>
                  <Select
                    value={createForm.incomeType}
                    onValueChange={(v) => setCreateForm((f) => ({ ...f, incomeType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(INCOME_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
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
                        <TableCell>{INCOME_TYPE_LABELS[c.incomeType] || c.incomeType}</TableCell>
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
                        <CardTitle className="text-sm font-medium text-muted-foreground">Unmapped Income</CardTitle>
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
                              setFilters((f) => ({ ...f, mapped: "false", startDate: reconStartDate, endDate: reconEndDate }));
                              setActiveTab("list");
                            }}
                          >
                            View & map
                          </button>
                        </p>
                      </CardContent>
                    </Card>
                  </div>
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
              <p><span className="font-medium">Type:</span> {INCOME_TYPE_LABELS[viewIncomeDialog.incomeType] || viewIncomeDialog.incomeType}</p>
              <p><span className="font-medium">Source:</span> {SOURCE_LABELS[viewIncomeDialog.source] || viewIncomeDialog.source}</p>
              <p><span className="font-medium">Campus:</span> {viewIncomeDialog.campus?.name || "Corporate Office"}</p>
              <p><span className="font-medium">Particulars:</span> {viewIncomeDialog.particulars || "—"}</p>
              <p><span className="font-medium">Mapped:</span> {viewIncomeDialog.registrationId ? "Yes" : "No"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Map Income Dialog */}
      <Dialog
        open={!!mapIncomeDialog}
        onOpenChange={(open) => {
          if (!open) {
            setMapIncomeDialog(null);
            setMapSearch("");
            setMapRegistrationId("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Map Income to Student</DialogTitle>
            <DialogDescription>
              {mapIncomeDialog && (
                <>₹ {mapIncomeDialog.amount.toLocaleString("en-IN")} — {mapIncomeDialog.particulars || "Deposit"}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {mapIncomeDialog && (
            <div className="space-y-4">
              <div>
                <Label>Search student (name, email, phone)</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Type to search..."
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div>
                <Label>Income Type</Label>
                <Select
                  value={mapIncomeType}
                  onValueChange={(v: "registration_fee" | "remaining_fee" | "hostel_fee") => setMapIncomeType(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registration_fee">Registration Fee</SelectItem>
                    <SelectItem value="remaining_fee">Remaining Fee</SelectItem>
                    <SelectItem value="hostel_fee">Hostel Fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Select student</Label>
                <div className="max-h-64 overflow-auto border rounded mt-1">
                  {suggestions.length > 0 && !mapSearch.trim() && (
                    <div className="border-b p-2 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Suggested matches (from bank particulars)</p>
                      <div className="divide-y">
                        {suggestions.map(({ registration: reg, reason }) => (
                          <button
                            key={reg.id}
                            type="button"
                            onClick={() => setMapRegistrationId(reg.id)}
                            className={cn(
                              "w-full text-left p-3 hover:bg-muted/50 transition-colors",
                              mapRegistrationId === reg.id && "bg-muted"
                            )}
                          >
                            <div className="font-medium">{reg.name}</div>
                            <div className="text-sm text-muted-foreground">{reg.email} • {reg.phone}</div>
                            <div className="text-xs text-primary">{reason}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!mapSearch.trim() || mapSearch.trim().length < 2) && suggestions.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      Type at least 2 characters to search, or wait for auto-suggestions from bank particulars.
                    </p>
                  ) : mapSearch.trim().length >= 2 && registrations.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      No matches. Try a different search.
                    </p>
                  ) : mapSearch.trim().length >= 2 ? (
                    <div className="divide-y">
                      {registrations.slice(0, 20).map((reg) => (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => setMapRegistrationId(reg.id)}
                          className={cn(
                            "w-full text-left p-3 hover:bg-muted/50 transition-colors",
                            mapRegistrationId === reg.id && "bg-muted"
                          )}
                        >
                          <div className="font-medium">{reg.name}</div>
                          <div className="text-sm text-muted-foreground">{reg.email} • {reg.phone}</div>
                          {reg.program && (
                            <div className="text-xs text-muted-foreground">{reg.program.name}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMapIncomeDialog(null)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (!mapRegistrationId) {
                      toast({ title: "Select a student", variant: "destructive" });
                      return;
                    }
                    mapMutation.mutate({
                      incomeId: mapIncomeDialog.id,
                      registrationId: mapRegistrationId,
                      incomeType: mapIncomeType,
                    });
                  }}
                  disabled={mapMutation.isPending || !mapRegistrationId}
                >
                  {mapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Map"}
                </Button>
              </DialogFooter>
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
                    {Object.entries(INCOME_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
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
                  {Object.entries(INCOME_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
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
