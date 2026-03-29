import { useState, useMemo } from "react";
import { Link, useSearchParams } from "wouter";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Loader2, Download, Database, BookOpen, GitCompareArrows, History, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import { ImportWizard, ImportPreviewVirtualizedRows, type ImportPreviewRow, type ImportIncomePreviewRow } from "@/components/import-wizard";
import type { ExpenseCategory, Campus } from "@shared/schema";

type UniversalAnalyzeResponse = {
  mode: "universal";
  documentType: string;
  destination: "bank_transactions" | "expenses" | "income_records" | "mixed";
  summary: string;
  preview: ImportPreviewRow[];
  totalRows: number;
  totalAmount: number;
  incomePreview: ImportIncomePreviewRow[];
  incomeTotalRows: number;
  incomeTotalAmount: number;
  skippedZero?: number;
  suggestedExpenseMappings: Record<string, string>;
  suggestedIncomeMappings: Record<string, string>;
  proposedNewCategories?: Array<{ name: string; slug: string; reason: string; type: "expense" | "income"; rowIndices?: number[] }>;
  parsedExpenseRows: Array<Record<string, unknown>>;
  parsedIncomeRows: Array<Record<string, unknown>>;
};

type LegacyAnalyzeResponse = {
  mode: "legacy_bank_csv";
  preview: ImportPreviewRow[];
  totalRows: number;
  totalAmount: number;
  incomePreview?: ImportIncomePreviewRow[];
  incomeTotalRows?: number;
  incomeTotalAmount?: number;
  skippedZero?: number;
  suggestedExpenseMappings?: Record<string, string>;
  suggestedIncomeMappings?: Record<string, string>;
  proposedNewCategories?: Array<{ name: string; slug: string; reason: string; type: "expense" | "income"; rowIndices?: number[] }>;
};

function DataJoeTab({
  tenantId,
  expenseCategories,
  incomeCategories,
  campuses,
  costCenterLabel,
}: {
  tenantId: string | null;
  expenseCategories: ExpenseCategory[];
  incomeCategories: Array<{ id: string; name: string; slug: string }>;
  campuses: Campus[];
  costCenterLabel: string;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [legacyHint, setLegacyHint] = useState(false);
  const [universal, setUniversal] = useState<UniversalAnalyzeResponse | null>(null);
  const [destination, setDestination] = useState<"bank_transactions" | "expenses" | "income_records" | "mixed">("mixed");
  const [expenseOverrides, setExpenseOverrides] = useState<Record<string, string>>({});
  const [incomeOverrides, setIncomeOverrides] = useState<Record<string, string>>({});
  const [costCenterOverrides, setCostCenterOverrides] = useState<Record<string, string | null>>({});
  const [incomeCostCenterOverrides, setIncomeCostCenterOverrides] = useState<Record<string, string | null>>({});
  const [skippedExpenseIndices, setSkippedExpenseIndices] = useState<Set<number>>(new Set());
  const [skippedIncomeIndices, setSkippedIncomeIndices] = useState<Set<number>>(new Set());

  const slugToExpCatId = useMemo(() => Object.fromEntries(expenseCategories.map((c) => [c.slug, c.id])), [expenseCategories]);
  const slugToIncCatId = useMemo(() => Object.fromEntries(incomeCategories.map((c) => [c.slug, c.id])), [incomeCategories]);

  const analyzeMutation = useMutation({
    mutationFn: async (opts: { file: File; password?: string }) => {
      const form = new FormData();
      form.append("file", opts.file);
      if (tenantId) form.append("tenantId", tenantId);
      if (opts.password) form.append("password", opts.password);
      const res = await fetch("/api/admin/datajoe/analyze", { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      return data as UniversalAnalyzeResponse | LegacyAnalyzeResponse | { mode: "universal"; needsPassword: true };
    },
    onSuccess: (data) => {
      if ("needsPassword" in data && data.needsPassword) {
        setPwdOpen(true);
        return;
      }
      if (data.mode === "legacy_bank_csv") {
        setLegacyHint(true);
        setStep(1);
        setFile(null);
        toast({
          title: "Standard bank CSV detected",
          description: "Use the “Bank Statement → Books” tab for the same AI import flow as before.",
        });
        return;
      }
      if (data.mode === "universal") {
        const u = data as UniversalAnalyzeResponse;
        setUniversal(u);
        setDestination(u.destination);
        const expO: Record<string, string> = {};
        const incO: Record<string, string> = {};
        for (const [idx, slug] of Object.entries(u.suggestedExpenseMappings ?? {})) {
          const id = slugToExpCatId[slug];
          if (id) expO[idx] = id;
        }
        for (const [idx, slug] of Object.entries(u.suggestedIncomeMappings ?? {})) {
          const id = slugToIncCatId[slug];
          if (id) incO[idx] = id;
        }
        setExpenseOverrides(expO);
        setIncomeOverrides(incO);
        setCostCenterOverrides({});
        setIncomeCostCenterOverrides({});
        setSkippedExpenseIndices(new Set());
        setSkippedIncomeIndices(new Set());
        setStep(2);
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!universal) throw new Error("No preview");
      const res = await fetch("/api/admin/datajoe/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenantId,
          destination,
          expenseRows: universal.parsedExpenseRows,
          incomeRows: universal.parsedIncomeRows,
          expenseOverrides,
          incomeOverrides,
          costCenterOverrides,
          incomeCostCenterOverrides,
          skipExpenseIndices: [...skippedExpenseIndices],
          skipIncomeIndices: [...skippedIncomeIndices],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data as { imported: number; incomeImported: number; bankOnly?: number };
    },
    onSuccess: (data) => {
      if (data.bankOnly != null) {
        toast({ title: "Import complete", description: `${data.bankOnly} bank lines imported for reconciliation.` });
      } else {
        toast({
          title: "Import complete",
          description: `${data.imported} expenses, ${data.incomeImported} income records.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/bank-transactions"] });
      setUniversal(null);
      setFile(null);
      setStep(1);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const expRows = universal?.preview ?? [];
  const incRows = universal?.incomePreview ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          dataJoe
        </CardTitle>
        <CardDescription>
          Upload PDF, Excel, XML, or non-standard CSV. AI extracts rows and maps categories. Password-protected PDFs are
          supported.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {legacyHint && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Standard bank CSV</p>
            <p className="text-muted-foreground mt-1">
              Open the <strong>Bank Statement → Books</strong> tab for the guided CSV import (same AI mapping as before).
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Label>Upload file</Label>
            <Input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,.xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setPendingFile(f);
                  setLegacyHint(false);
                  analyzeMutation.mutate({ file: f });
                }
              }}
            />
            {analyzeMutation.isPending && <p className="text-sm text-muted-foreground">dataJoe is analyzing your document…</p>}
          </div>
        )}

        {step === 2 && universal && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{universal.documentType}</Badge>
              <span className="text-sm text-muted-foreground">{universal.summary}</span>
            </div>
            <div className="max-w-xs">
              <Label>Destination</Label>
              <Select value={destination} onValueChange={(v) => setDestination(v as typeof destination)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Books + bank links (expenses & income)</SelectItem>
                  <SelectItem value="bank_transactions">Reconciliation only (bank lines)</SelectItem>
                  <SelectItem value="expenses">Expenses only</SelectItem>
                  <SelectItem value="income_records">Income only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              {universal.totalRows} debits (₹ {universal.totalAmount.toLocaleString("en-IN")}) · {universal.incomeTotalRows}{" "}
              credits (₹ {universal.incomeTotalAmount.toLocaleString("en-IN")})
            </p>
            <ImportPreviewVirtualizedRows
              expRows={expRows}
              incRows={incRows}
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              campuses={campuses}
              costCenterLabel={costCenterLabel}
              expenseOverrides={expenseOverrides}
              incomeOverrides={incomeOverrides}
              costCenterOverrides={costCenterOverrides}
              incomeCostCenterOverrides={incomeCostCenterOverrides}
              setExpenseOverrides={setExpenseOverrides}
              setIncomeOverrides={setIncomeOverrides}
              setCostCenterOverrides={setCostCenterOverrides}
              setIncomeCostCenterOverrides={setIncomeCostCenterOverrides}
              slugToExpCatId={slugToExpCatId}
              slugToIncCatId={slugToIncCatId}
              skippedExpenseIndices={skippedExpenseIndices}
              skippedIncomeIndices={skippedIncomeIndices}
              setSkippedExpenseIndices={setSkippedExpenseIndices}
              setSkippedIncomeIndices={setSkippedIncomeIndices}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setUniversal(null); setFile(null); }}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && universal && (
          <div className="space-y-4">
            <p className="text-sm">
              Confirm import to <strong>{destination.replace(/_/g, " ")}</strong>.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
                {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PDF password</DialogTitle>
            <DialogDescription>This PDF is encrypted. Enter the password to continue.</DialogDescription>
          </DialogHeader>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingFile) {
                  analyzeMutation.mutate({ file: pendingFile, password });
                  setPwdOpen(false);
                  setPassword("");
                }
              }}
            >
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AdminDataHandling() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, canImportExpenses } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? urlTenantId || user?.tenantId || null : user?.tenantId ?? null;
  const tab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t === "books" || t === "recon" || t === "history" || t === "datajoe") return t;
    return "datajoe";
  }, [searchParams]);

  const setTabInUrl = (v: string) => {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.set("tab", v);
      if (tenantId) n.set("tenantId", tenantId);
      return n.toString() ? `?${n}` : "";
    });
  };

  const { costCenterLabel } = useCostCenterLabel(tenantId);

  const { data: categoriesForAdmin = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ["/api/admin/expense-categories", tenantId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/expense-categories${tenantId ? `?tenantId=${tenantId}` : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && canImportExpenses,
  });

  const { data: incomeCategoriesForImport = [] } = useQuery<Array<{ id: string; name: string; slug: string }>>({
    queryKey: ["/api/admin/income-categories", "import", tenantId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/income-categories${tenantId ? `?tenantId=${tenantId}` : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && canImportExpenses,
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/admin/campuses", tenantId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/campuses${tenantId ? `?tenantId=${tenantId}` : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && canImportExpenses,
  });

  const histStart = format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const histEnd = format(new Date(), "yyyy-MM-dd");
  const histParams = new URLSearchParams({ startDate: histStart, endDate: histEnd, limit: "500" });
  if (tenantId) histParams.append("tenantId", tenantId);

  const { data: historyData } = useQuery<{ rows: Array<{ importBatchId: string | null; type: string; amount: number; createdAt: string }> }>({
    queryKey: ["/api/admin/reconciliation/bank-transactions", "history", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reconciliation/bank-transactions?${histParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && tab === "history",
  });

  const batches = useMemo(() => {
    const rows = historyData?.rows ?? [];
    const map = new Map<
      string,
      { batchId: string; count: number; debits: number; credits: number; lastCreated: string }
    >();
    for (const r of rows) {
      const bid = r.importBatchId ?? "none";
      if (bid === "none") continue;
      const cur = map.get(bid) ?? { batchId: bid, count: 0, debits: 0, credits: 0, lastCreated: r.createdAt };
      cur.count += 1;
      if (r.type === "debit") cur.debits += r.amount;
      else cur.credits += r.amount;
      if (r.createdAt > cur.lastCreated) cur.lastCreated = r.createdAt;
      map.set(bid, cur);
    }
    return [...map.values()].sort((a, b) => b.lastCreated.localeCompare(a.lastCreated));
  }, [historyData]);

  const reconImportMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation/bank-transactions"] });
      toast({ title: "Bank statement imported", description: `${data.imported} transactions imported.` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  if (!tenantId || !canImportExpenses) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {isSuperAdmin ? "Select a tenant to use Data Handling." : "You don’t have access to data import."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Database className="h-7 w-7" />
          Data Handling
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Single place for dataJoe (PDF/Excel/XML), bank CSV → books, and bank CSV → reconciliation.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTabInUrl}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="datajoe" className="gap-1">
            <Sparkles className="h-4 w-4" />
            dataJoe
          </TabsTrigger>
          <TabsTrigger value="books" className="gap-1">
            <BookOpen className="h-4 w-4" />
            Bank → Books
          </TabsTrigger>
          <TabsTrigger value="recon" className="gap-1">
            <GitCompareArrows className="h-4 w-4" />
            Bank → Reconciliation
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-4 w-4" />
            Import history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datajoe" className="mt-4">
          <DataJoeTab
            tenantId={tenantId}
            expenseCategories={categoriesForAdmin.filter((c) => c.isActive)}
            incomeCategories={incomeCategoriesForImport}
            campuses={campuses}
            costCenterLabel={costCenterLabel}
          />
        </TabsContent>

        <TabsContent value="books" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Bank Statement → Books</CardTitle>
              <CardDescription>
                CSV with Date, Particulars, Withdrawals, Deposits, Major Head, Branch. Same AI mapping as before.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const res = await fetch("/api/admin/expenses/import/template", { credentials: "include" });
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
                  Download template
                </Button>
              </div>
              <ImportWizard
                tenantId={tenantId}
                expenseCategories={categoriesForAdmin.filter((c) => c.isActive)}
                incomeCategories={incomeCategoriesForImport}
                campuses={campuses}
                costCenterLabel={costCenterLabel}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/income"] });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recon" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Bank Statement → Reconciliation</CardTitle>
              <CardDescription>Import raw bank lines for matching (same API as before).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                id="recon-csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) reconImportMutation.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" asChild disabled={reconImportMutation.isPending}>
                <label htmlFor="recon-csv" className="cursor-pointer">
                  {reconImportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload bank CSV
                </label>
              </Button>
              <p className="text-sm text-muted-foreground">
                Full reconciliation workspace:{" "}
                <Link href="/admin/reconciliation" className="text-primary underline">
                  Reconciliation
                </Link>
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Import history</CardTitle>
              <CardDescription>Bank import batches (last 12 months, up to 500 rows loaded).</CardDescription>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No batched imports in range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Debits ₹</TableHead>
                      <TableHead className="text-right">Credits ₹</TableHead>
                      <TableHead>Last activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.batchId}>
                        <TableCell className="font-mono text-xs">{b.batchId.slice(0, 8)}…</TableCell>
                        <TableCell className="text-right">{b.count}</TableCell>
                        <TableCell className="text-right">{b.debits.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right">{b.credits.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(b.lastCreated), "dd MMM yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
