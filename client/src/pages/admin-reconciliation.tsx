import { useState, useRef } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  GitCompareArrows,
  Upload,
  Loader2,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type BankTransaction = {
  id: string;
  transactionDate: string;
  particulars: string | null;
  amount: number;
  type: string;
  reconciliationStatus: string;
  matchedExpenseId: string | null;
  matchedIncomeId: string | null;
  matchConfidence: string | null;
  matchedAt: string | null;
  importBatchId: string | null;
  createdAt: string;
};

type UnmatchedExpense = {
  id: string;
  amount: number;
  expenseDate: string;
  description: string | null;
  vendorName: string | null;
  status: string;
  source: string;
  categoryName: string | null;
  costCenterName: string | null;
};

type UnmatchedIncome = {
  id: string;
  amount: number;
  incomeDate: string;
  particulars: string | null;
  source: string;
  categoryName: string | null;
};

type AiSuggestion = {
  bankTransactionId: string;
  expenseId?: string;
  incomeId?: string;
  bankAmount: number;
  matchedAmount: number;
  reason: string;
  confidence: string;
};

type Summary = {
  totalBankTransactions: number;
  totalBankDebits: number;
  totalBankCredits: number;
  matchedCount: number;
  unmatchedBankCount: number;
  unmatchedExpenseCount: number;
  unmatchedIncomeCount: number;
  netPosition: number;
};

export default function AdminReconciliation() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const tenantId = isSuperAdmin ? (searchParams.get("tenantId") || user?.tenantId || null) : user?.tenantId ?? null;

  const [activeTab, setActiveTab] = useState("bank-transactions");
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [matchDialog, setMatchDialog] = useState<BankTransaction | null>(null);
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryParams = new URLSearchParams({ startDate, endDate });
  if (tenantId) queryParams.append("tenantId", tenantId);

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ["/api/admin/reconciliation/summary", startDate, endDate, tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/summary?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const bankTxnParams = new URLSearchParams(queryParams);
  if (statusFilter !== "all") bankTxnParams.set("status", statusFilter);

  const { data: bankTxnData, isLoading: bankTxnLoading } = useQuery<{ rows: BankTransaction[]; total: number }>({
    queryKey: ["/api/admin/reconciliation/bank-transactions", startDate, endDate, tenantId, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/bank-transactions?${bankTxnParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: unmatchedExpData, isLoading: unmatchedExpLoading } = useQuery<{ rows: UnmatchedExpense[]; total: number }>({
    queryKey: ["/api/admin/reconciliation/unmatched-expenses", startDate, endDate, tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/unmatched-expenses?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId && activeTab === "unmatched-expenses",
  });

  const { data: unmatchedIncData, isLoading: unmatchedIncLoading } = useQuery<{ rows: UnmatchedIncome[]; total: number }>({
    queryKey: ["/api/admin/reconciliation/unmatched-income", startDate, endDate, tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/unmatched-income?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId && activeTab === "unmatched-income",
  });

  const matchExpCandidates = unmatchedExpData?.rows.filter((e) => {
    if (!matchDialog) return false;
    if (matchSearchQuery) {
      const q = matchSearchQuery.toLowerCase();
      return (
        (e.description?.toLowerCase().includes(q) || false) ||
        (e.vendorName?.toLowerCase().includes(q) || false) ||
        String(e.amount).includes(q)
      );
    }
    return true;
  }) ?? [];

  const matchIncCandidates = unmatchedIncData?.rows.filter((i) => {
    if (!matchDialog) return false;
    if (matchSearchQuery) {
      const q = matchSearchQuery.toLowerCase();
      return (
        (i.particulars?.toLowerCase().includes(q) || false) ||
        String(i.amount).includes(q)
      );
    }
    return true;
  }) ?? [];

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/auto-match?${queryParams}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Auto-match failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Auto-match complete", description: `${data.matched} transactions matched.` });
      invalidateAll();
    },
    onError: () => toast({ title: "Auto-match failed", variant: "destructive" }),
  });

  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const aiSuggestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/ai-suggest?${queryParams}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("AI suggest failed");
      return res.json();
    },
    onSuccess: (data) => {
      setAiSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        toast({ title: "No AI suggestions", description: "No additional matches found." });
      }
    },
    onError: () => toast({ title: "AI suggest failed", variant: "destructive" }),
  });

  const manualMatchMutation = useMutation({
    mutationFn: async (payload: { bankTransactionId: string; expenseId?: string; incomeId?: string }) => {
      const res = await fetch(`/api/admin/reconciliation/match?${tenantId ? `tenantId=${tenantId}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Match failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Matched successfully" });
      setMatchDialog(null);
      invalidateAll();
    },
    onError: () => toast({ title: "Match failed", variant: "destructive" }),
  });

  const unmatchMutation = useMutation({
    mutationFn: async (bankTransactionId: string) => {
      const res = await fetch(`/api/admin/reconciliation/unmatch?${tenantId ? `tenantId=${tenantId}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bankTransactionId }),
      });
      if (!res.ok) throw new Error("Unmatch failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Unmatched successfully" });
      invalidateAll();
    },
    onError: () => toast({ title: "Unmatch failed", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (tenantId) formData.append("tenantId", tenantId);
      const res = await fetch(`/api/admin/reconciliation/import?${tenantId ? `tenantId=${tenantId}` : ""}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Bank statement imported", description: `${data.imported} transactions imported.` });
      invalidateAll();
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/bank-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/unmatched-expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/unmatched-income"] });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) importMutation.mutate(file);
    e.target.value = "";
  }

  function applyAiSuggestion(s: AiSuggestion) {
    manualMatchMutation.mutate({
      bankTransactionId: s.bankTransactionId,
      expenseId: s.expenseId,
      incomeId: s.incomeId,
    });
    setAiSuggestions((prev) => prev.filter((x) => x.bankTransactionId !== s.bankTransactionId));
  }

  const fmt = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;
  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
  };

  if (!tenantId) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {isSuperAdmin ? "Select a tenant to manage reconciliation." : "Tenant context required."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitCompareArrows className="h-6 w-6" />
            Bank Reconciliation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Match bank statement entries against expenses and income records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload Bank Statement
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[150px]" />
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => autoMatchMutation.mutate()}
          disabled={autoMatchMutation.isPending}
        >
          {autoMatchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
          Auto-Match
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => aiSuggestMutation.mutate()}
          disabled={aiSuggestMutation.isPending}
        >
          {aiSuggestMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
          AI Suggest
        </Button>
      </div>

      {/* KPI Cards */}
      {summaryLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bank Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalBankTransactions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-red-500">{fmt(summary.totalBankDebits)} debits</span>
                {" / "}
                <span className="text-green-500">{fmt(summary.totalBankCredits)} credits</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Matched</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summary.matchedCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Reconciled entries</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unmatched Bank</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", summary.unmatchedBankCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600")}>
                {summary.unmatchedBankCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">No matching expense/income</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unmatched Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", summary.unmatchedExpenseCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600")}>
                {summary.unmatchedExpenseCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Not confirmed by bank</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Position</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", summary.netPosition >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                {fmt(summary.netPosition)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Credits - Debits</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI-Suggested Matches
            </CardTitle>
            <CardDescription>Review and apply suggestions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {aiSuggestions.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.confidence === "high" ? "default" : "secondary"}>{s.confidence}</Badge>
                    <span className="text-sm">
                      Bank {fmt(s.bankAmount)} {s.expenseId ? "-> Expense" : "-> Income"} {fmt(s.matchedAmount)}
                      <span className="text-muted-foreground ml-2">-- {s.reason}</span>
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyAiSuggestion(s)}
                    disabled={manualMatchMutation.isPending}
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Apply
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="bank-transactions">All Bank Transactions</TabsTrigger>
              <TabsTrigger value="unmatched-expenses">
                Unmatched Expenses
                {summary && summary.unmatchedExpenseCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">{summary.unmatchedExpenseCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="unmatched-income">
                Unmatched Income
                {summary && summary.unmatchedIncomeCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">{summary.unmatchedIncomeCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: All Bank Transactions */}
            <TabsContent value="bank-transactions">
              <div className="space-y-4">
                <div className="flex gap-2 items-center">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="matched">Matched</SelectItem>
                      <SelectItem value="unmatched">Unmatched</SelectItem>
                      <SelectItem value="auto_from_import">Auto (Import)</SelectItem>
                    </SelectContent>
                  </Select>
                  {bankTxnData && <span className="text-sm text-muted-foreground">{bankTxnData.total} transactions</span>}
                </div>

                {bankTxnLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[110px]">Date</TableHead>
                          <TableHead>Particulars</TableHead>
                          <TableHead className="text-right w-[120px]">Debit</TableHead>
                          <TableHead className="text-right w-[120px]">Credit</TableHead>
                          <TableHead className="w-[130px]">Status</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(bankTxnData?.rows ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              No bank transactions found. Upload a bank statement CSV to get started.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (bankTxnData?.rows ?? []).map((bt) => (
                            <TableRow key={bt.id}>
                              <TableCell className="text-sm">{fmtDate(bt.transactionDate)}</TableCell>
                              <TableCell className="text-sm max-w-[300px] truncate">{bt.particulars || "-"}</TableCell>
                              <TableCell className="text-right text-sm text-red-600 dark:text-red-400">
                                {bt.type === "debit" ? fmt(bt.amount) : ""}
                              </TableCell>
                              <TableCell className="text-right text-sm text-green-600 dark:text-green-400">
                                {bt.type === "credit" ? fmt(bt.amount) : ""}
                              </TableCell>
                              <TableCell>
                                {bt.reconciliationStatus === "matched" || bt.reconciliationStatus === "auto_from_import" ? (
                                  <Badge 
                                    variant="default" 
                                    className="text-xs"
                                    title={(bt as any).matchedByName ? `Matched by: ${(bt as any).matchedByName}` : "Matched automatically"}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {bt.matchConfidence ?? "matched"}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    unmatched
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {bt.reconciliationStatus === "unmatched" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setMatchDialog(bt);
                                      setMatchSearchQuery("");
                                    }}
                                  >
                                    <Link2 className="h-3 w-3 mr-1" />
                                    Match
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => unmatchMutation.mutate(bt.id)}
                                    disabled={unmatchMutation.isPending}
                                  >
                                    <Unlink className="h-3 w-3 mr-1" />
                                    Unmatch
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 2: Unmatched Expenses */}
            <TabsContent value="unmatched-expenses">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Expenses from WhatsApp or web that have no matching bank statement entry.
                </p>
                {unmatchedExpLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[110px]">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right w-[120px]">Amount</TableHead>
                          <TableHead className="w-[100px]">Source</TableHead>
                          <TableHead className="w-[80px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(unmatchedExpData?.rows ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              All expenses are matched with bank entries.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (unmatchedExpData?.rows ?? []).map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="text-sm">{fmtDate(e.expenseDate)}</TableCell>
                              <TableCell className="text-sm max-w-[250px] truncate">{e.description || "-"}</TableCell>
                              <TableCell className="text-sm">{e.vendorName || "-"}</TableCell>
                              <TableCell className="text-sm">{e.categoryName || "-"}</TableCell>
                              <TableCell className="text-right text-sm font-medium text-red-600 dark:text-red-400">{fmt(e.amount)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{e.source}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">{e.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab 3: Unmatched Income */}
            <TabsContent value="unmatched-income">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Income records that have no matching bank statement entry.
                </p>
                {unmatchedIncLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[110px]">Date</TableHead>
                          <TableHead>Particulars</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right w-[120px]">Amount</TableHead>
                          <TableHead className="w-[100px]">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(unmatchedIncData?.rows ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              All income records are matched with bank entries.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (unmatchedIncData?.rows ?? []).map((i) => (
                            <TableRow key={i.id}>
                              <TableCell className="text-sm">{fmtDate(i.incomeDate)}</TableCell>
                              <TableCell className="text-sm max-w-[300px] truncate">{i.particulars || "-"}</TableCell>
                              <TableCell className="text-sm">{i.categoryName || "-"}</TableCell>
                              <TableCell className="text-right text-sm font-medium text-green-600 dark:text-green-400">{fmt(i.amount)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{i.source}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Manual Match Dialog */}
      <Dialog open={!!matchDialog} onOpenChange={() => setMatchDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Match Bank Transaction
            </DialogTitle>
            <DialogDescription>
              {matchDialog && (
                <span>
                  {fmtDate(matchDialog.transactionDate)} -- {matchDialog.particulars} -- {matchDialog.type === "debit" ? "Debit" : "Credit"} {fmt(matchDialog.amount)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by description, vendor, amount..."
                value={matchSearchQuery}
                onChange={(e) => setMatchSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {matchDialog?.type === "debit" ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Matching Expenses</Label>
                {matchExpCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No unmatched expenses found. Try adjusting the date range.</p>
                ) : (
                  matchExpCandidates.slice(0, 20).map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => manualMatchMutation.mutate({ bankTransactionId: matchDialog!.id, expenseId: e.id })}
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{e.description || e.vendorName || "Expense"}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(e.expenseDate)} -- {e.categoryName} -- {e.source}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-red-600 dark:text-red-400">{fmt(e.amount)}</div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Matching Income</Label>
                {matchIncCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No unmatched income found. Try adjusting the date range.</p>
                ) : (
                  matchIncCandidates.slice(0, 20).map((i) => (
                    <div
                      key={i.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => manualMatchMutation.mutate({ bankTransactionId: matchDialog!.id, incomeId: i.id })}
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{i.particulars || "Income"}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(i.incomeDate)} -- {i.categoryName} -- {i.source}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-green-600 dark:text-green-400">{fmt(i.amount)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
