import { useState, useRef, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  Repeat,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenterLabel } from "@/hooks/use-cost-center-label";
import type {
  ExpenseWithDetails,
  ExpenseCategory,
  Campus,
} from "@shared/schema";

type PreviewRow = { date: string | null; dateRaw?: string; particulars: string; amount: number; majorHead?: string; branch?: string; categoryMatch: string; potentialDuplicate?: boolean; matchConfidence?: "exact" | "probable"; matchedExpenseId?: string; matchedExpenseStatus?: string; matchedExpenseSource?: string };
type IncomePreviewRow = { date: string | null; dateRaw?: string; particulars: string; amount: number; majorHead?: string; branch?: string; categoryMatch: string; potentialDuplicate?: boolean; matchConfidence?: "exact" | "probable"; matchedExpenseId?: string; matchedExpenseSource?: string };

function importPreviewDateCell(r: { date?: string | null; dateRaw?: string }): { label: string; title?: string } {
  if (r.date) return { label: r.date };
  const raw = r.dateRaw?.trim();
  if (raw) return { label: "No date", title: `Unparsed CSV date: ${raw}` };
  return { label: "No date", title: "Date column empty or missing" };
}

const ROW_HEIGHT = 52;

function ImportPreviewVirtualizedRows({
  expRows,
  incRows,
  expenseCategories,
  incomeCategories,
  campuses,
  costCenterLabel,
  expenseOverrides,
  incomeOverrides,
  costCenterOverrides,
  incomeCostCenterOverrides,
  setExpenseOverrides,
  setIncomeOverrides,
  setCostCenterOverrides,
  setIncomeCostCenterOverrides,
  slugToExpCatId,
  slugToIncCatId,
  skippedExpenseIndices,
  skippedIncomeIndices,
  setSkippedExpenseIndices,
  setSkippedIncomeIndices,
}: {
  expRows: PreviewRow[];
  incRows: IncomePreviewRow[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: Array<{ id: string; name: string; slug: string }>;
  campuses: Campus[];
  costCenterLabel: string;
  expenseOverrides: Record<string, string>;
  incomeOverrides: Record<string, string>;
  costCenterOverrides: Record<string, string | null>;
  incomeCostCenterOverrides: Record<string, string | null>;
  setExpenseOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setIncomeOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCostCenterOverrides: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  setIncomeCostCenterOverrides: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  slugToExpCatId: Record<string, string>;
  slugToIncCatId: Record<string, string>;
  skippedExpenseIndices: Set<number>;
  skippedIncomeIndices: Set<number>;
  setSkippedExpenseIndices: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSkippedIncomeIndices: React.Dispatch<React.SetStateAction<Set<number>>>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const allRows = useMemo(() => {
    const items: Array<{ type: "expense" | "income"; index: number; row: PreviewRow | IncomePreviewRow }> = [];
    expRows.forEach((r, i) => items.push({ type: "expense", index: i, row: r }));
    incRows.forEach((r, i) => items.push({ type: "income", index: i, row: r }));
    return items;
  }, [expRows, incRows]);

  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  if (allRows.length === 0) return null;

  return (
    <div className="border rounded">
      <div className="grid grid-cols-[50px_80px_90px_1fr_90px_130px_150px] gap-2 px-4 py-2 border-b bg-muted/50 text-sm font-medium">
        <div>Skip</div>
        <div>Type</div>
        <div>Date</div>
        <div>Particulars</div>
        <div>Amount</div>
        <div>{costCenterLabel}</div>
        <div>Category</div>
      </div>
      <div
        ref={parentRef}
        className="max-h-80 overflow-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = allRows[virtualRow.index];
            if (item.type === "expense") {
              const r = item.row as PreviewRow;
              const i = item.index;
              const isSkipped = skippedExpenseIndices.has(i);
              return (
                <div
                  key={`exp-${i}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    height: ROW_HEIGHT,
                  }}
                  className={cn("grid grid-cols-[50px_80px_90px_1fr_90px_130px_150px] gap-2 items-center border-b px-4 py-1", isSkipped && "opacity-50")}
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isSkipped}
                      onChange={() => setSkippedExpenseIndices((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}
                      className="h-4 w-4"
                      title={r.potentialDuplicate ? `Potential duplicate (${r.matchConfidence}) — ${r.matchedExpenseSource ?? ""}` : "Skip this row"}
                    />
                    {r.potentialDuplicate && (
                      <AlertTriangle className={cn("h-3.5 w-3.5", r.matchConfidence === "exact" ? "text-destructive" : "text-yellow-500")} />
                    )}
                  </div>
                  <div>
                    <Badge variant="outline">Expense</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-[88px]" title={importPreviewDateCell(r).title}>
                    {importPreviewDateCell(r).label}
                  </div>
                  <div className="truncate min-w-0 text-sm" title={r.particulars}>{r.particulars}</div>
                  <div className="text-sm">₹ {r.amount.toLocaleString("en-IN")}</div>
                  <div className="min-w-0">
                    <Select
                      value={
                        costCenterOverrides[String(i)] !== undefined
                          ? (costCenterOverrides[String(i)] ?? "__corporate__")
                          : (r.branch ? campuses.find((c) => c.name.toLowerCase() === r.branch?.toLowerCase() || c.slug?.toLowerCase() === r.branch?.toLowerCase())?.id ?? "__corporate__" : "__corporate__")
                      }
                      onValueChange={(v) => setCostCenterOverrides((o) => ({ ...o, [String(i)]: v === "__corporate__" ? null : v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__corporate__">Corporate</SelectItem>
                        {campuses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Select
                      value={expenseOverrides[String(i)] ?? slugToExpCatId[r.categoryMatch] ?? expenseCategories[0]?.id}
                      onValueChange={(v) => setExpenseOverrides((o) => ({ ...o, [String(i)]: v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            } else {
              const r = item.row as IncomePreviewRow;
              const i = item.index;
              const isSkipped = skippedIncomeIndices.has(i);
              return (
                <div
                  key={`inc-${i}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    height: ROW_HEIGHT,
                  }}
                  className={cn("grid grid-cols-[50px_80px_90px_1fr_90px_130px_150px] gap-2 items-center border-b px-4 py-1", isSkipped && "opacity-50")}
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isSkipped}
                      onChange={() => setSkippedIncomeIndices((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}
                      className="h-4 w-4"
                      title={r.potentialDuplicate ? `Potential duplicate (${r.matchConfidence}) — ${r.matchedExpenseSource ?? ""}` : "Skip this row"}
                    />
                    {r.potentialDuplicate && (
                      <AlertTriangle className={cn("h-3.5 w-3.5", r.matchConfidence === "exact" ? "text-destructive" : "text-yellow-500")} />
                    )}
                  </div>
                  <div>
                    <Badge className="bg-green-600">Income</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-[88px]" title={importPreviewDateCell(r).title}>
                    {importPreviewDateCell(r).label}
                  </div>
                  <div className="truncate min-w-0 text-sm" title={r.particulars}>{r.particulars}</div>
                  <div className="text-green-600 text-sm">₹ {r.amount.toLocaleString("en-IN")}</div>
                  <div className="min-w-0">
                    <Select
                      value={
                        incomeCostCenterOverrides[String(i)] !== undefined
                          ? (incomeCostCenterOverrides[String(i)] ?? "__corporate__")
                          : (r.branch ? campuses.find((c) => c.name.toLowerCase() === r.branch?.toLowerCase() || c.slug?.toLowerCase() === r.branch?.toLowerCase())?.id ?? "__corporate__" : "__corporate__")
                      }
                      onValueChange={(v) => setIncomeCostCenterOverrides((o) => ({ ...o, [String(i)]: v === "__corporate__" ? null : v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__corporate__">Corporate</SelectItem>
                        {campuses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Select
                      value={incomeOverrides[String(i)] ?? slugToIncCatId[r.categoryMatch] ?? incomeCategories[0]?.id ?? (incomeCategories.length === 0 ? "__skip__" : "")}
                      onValueChange={(v) => setIncomeOverrides((o) => ({ ...o, [String(i)]: v === "__skip__" ? "" : v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {incomeCategories.length === 0 ? (
                          <SelectItem value="__skip__" disabled>Add categories in Income page</SelectItem>
                        ) : (
                          incomeCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            }
          })}
        </div>
      </div>
    </div>
  );
}

function ImportWizard({
  tenantId,
  expenseCategories,
  incomeCategories,
  campuses,
  costCenterLabel,
  onSuccess,
}: {
  tenantId: string | null;
  expenseCategories: ExpenseCategory[];
  incomeCategories: Array<{ id: string; name: string; slug: string }>;
  campuses: Campus[];
  costCenterLabel: string;
  onSuccess: () => void;
}) {
  const addCategoryMutation = useMutation({
    mutationFn: async (proposed: { name: string; slug: string; type: "expense" | "income"; rowIndices?: number[] }) => {
      if (proposed.type === "expense") {
        const res = await apiRequest("POST", "/api/admin/expense-categories", {
          name: proposed.name,
          slug: proposed.slug,
          cashflowLabel: proposed.name,
          tenantId,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create category");
        }
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/admin/income-categories", {
          name: proposed.name,
          slug: proposed.slug,
          tenantId,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create category");
        }
        return res.json();
      }
    },
    onSuccess: (created, proposed) => {
      if (proposed.type === "expense") {
        setExpenseOverrides((prev) => {
          const next = { ...prev };
          for (const i of proposed.rowIndices ?? []) {
            next[String(i)] = created.id;
          }
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-categories"] });
      } else {
        setIncomeOverrides((prev) => {
          const next = { ...prev };
          for (const i of proposed.rowIndices ?? []) {
            next[String(i)] = created.id;
          }
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/income-categories"] });
      }
      toast({ title: "Category created", description: `${proposed.name} added and applied to ${(proposed.rowIndices ?? []).length} rows` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    preview: PreviewRow[];
    totalRows: number;
    totalAmount: number;
    incomePreview?: IncomePreviewRow[];
    incomeTotalRows?: number;
    incomeTotalAmount?: number;
    skippedZero?: number;
    suggestedExpenseMappings?: Record<string, string>;
    suggestedIncomeMappings?: Record<string, string>;
    proposedNewCategories?: Array<{ name: string; slug: string; reason: string; type: "expense" | "income"; rowIndices?: number[] }>;
  } | null>(null);
  const [expenseOverrides, setExpenseOverrides] = useState<Record<string, string>>({});
  const [incomeOverrides, setIncomeOverrides] = useState<Record<string, string>>({});
  const [costCenterOverrides, setCostCenterOverrides] = useState<Record<string, string | null>>({});
  const [incomeCostCenterOverrides, setIncomeCostCenterOverrides] = useState<Record<string, string | null>>({});
  const [bulkMapPattern, setBulkMapPattern] = useState("");
  const [bulkMapType, setBulkMapType] = useState<"expense" | "income">("expense");
  const [bulkMapCategoryId, setBulkMapCategoryId] = useState("");
  const [skippedExpenseIndices, setSkippedExpenseIndices] = useState<Set<number>>(new Set());
  const [skippedIncomeIndices, setSkippedIncomeIndices] = useState<Set<number>>(new Set());

  const slugToExpCatId = Object.fromEntries(expenseCategories.map((c) => [c.slug, c.id]));
  const slugToIncCatId = Object.fromEntries(incomeCategories.map((c) => [c.slug, c.id]));

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("file", f);
      if (tenantId) form.append("tenantId", tenantId);
      const res = await fetch("/api/admin/expenses/import/analyze", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Analysis failed");
      return res.json();
    },
    onSuccess: (data) => {
      setPreview(data);
      const slugToExp = Object.fromEntries(expenseCategories.map((c) => [c.slug, c.id]));
      const slugToInc = Object.fromEntries(incomeCategories.map((c) => [c.slug, c.id]));
      const expOverrides: Record<string, string> = {};
      const incOverrides: Record<string, string> = {};
      for (const [idx, slug] of Object.entries(data.suggestedExpenseMappings ?? {})) {
        const id = slugToExp[slug];
        if (id) expOverrides[idx] = id;
      }
      for (const [idx, slug] of Object.entries(data.suggestedIncomeMappings ?? {})) {
        const id = slugToInc[slug];
        if (id) incOverrides[idx] = id;
      }
      setExpenseOverrides(expOverrides);
      setIncomeOverrides(incOverrides);
      setCostCenterOverrides({});
      setIncomeCostCenterOverrides({});
      const autoSkipExp = new Set<number>();
      (data.preview ?? []).forEach((r: PreviewRow, i: number) => {
        if (r.potentialDuplicate) autoSkipExp.add(i);
      });
      setSkippedExpenseIndices(autoSkipExp);
      const autoSkipInc = new Set<number>();
      (data.incomePreview ?? []).forEach((r: IncomePreviewRow, i: number) => {
        if (r.potentialDuplicate) autoSkipInc.add(i);
      });
      setSkippedIncomeIndices(autoSkipInc);
      setStep(2);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("file", f);
      if (tenantId) form.append("tenantId", tenantId);
      form.append("expenseOverrides", JSON.stringify(expenseOverrides));
      form.append("incomeOverrides", JSON.stringify(incomeOverrides));
      form.append("costCenterOverrides", JSON.stringify(costCenterOverrides));
      form.append("incomeCostCenterOverrides", JSON.stringify(incomeCostCenterOverrides));
      if (skippedExpenseIndices.size > 0) form.append("skipExpenseIndices", JSON.stringify([...skippedExpenseIndices]));
      if (skippedIncomeIndices.size > 0) form.append("skipIncomeIndices", JSON.stringify([...skippedIncomeIndices]));
      const res = await fetch("/api/admin/expenses/import/execute", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      const skipped = (data.skippedExpenses ?? 0) + (data.skippedIncome ?? 0);
      const skipPart = skipped > 0 ? `, ${skipped} duplicates skipped` : "";
      const msg = data.incomeImported > 0
        ? `${data.imported} expenses, ${data.incomeImported} income imported${skipPart}`
        : `${data.imported} expenses imported${skipPart}`;
      toast({ title: "Import complete", description: msg });
      setFile(null);
      setPreview(null);
      setStep(1);
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const expRows = preview?.preview ?? [];
  const incRows = preview?.incomePreview ?? [];

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        <div className={cn("flex items-center gap-1", step >= 1 && "text-primary font-medium")}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">{step > 1 ? "1" : "1"}</span>
          Upload
        </div>
        <div className="h-px w-8 bg-border" />
        <div className={cn("flex items-center gap-1", step >= 2 && "text-primary font-medium")}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">2</span>
          Review & Map
        </div>
        <div className="h-px w-8 bg-border" />
        <div className={cn("flex items-center gap-1", step >= 3 && "text-primary font-medium")}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">3</span>
          Import
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
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
                  previewMutation.mutate(f);
                }
              }}
            />
          </div>
          {previewMutation.isPending && <p className="text-sm text-muted-foreground">Analyzing CSV with AI...</p>}
        </div>
      )}

      {/* Step 2: Review & Map */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {preview.totalRows} expenses (₹ {preview.totalAmount.toLocaleString("en-IN")})
            {preview.incomeTotalRows && preview.incomeTotalRows > 0 && (
              <span className="ml-2 text-green-600 dark:text-green-400">
                • {preview.incomeTotalRows} income (₹ {(preview.incomeTotalAmount ?? 0).toLocaleString("en-IN")})
              </span>
            )}
          </p>
          {/* Bulk branch → cost center mapping */}
          {(() => {
            const allBranches = new Map<string, { expIndices: number[]; incIndices: number[] }>();
            expRows.forEach((r, i) => {
              const b = r.branch?.trim();
              if (!b) return;
              if (!allBranches.has(b)) allBranches.set(b, { expIndices: [], incIndices: [] });
              allBranches.get(b)!.expIndices.push(i);
            });
            incRows.forEach((r, i) => {
              const b = r.branch?.trim();
              if (!b) return;
              if (!allBranches.has(b)) allBranches.set(b, { expIndices: [], incIndices: [] });
              allBranches.get(b)!.incIndices.push(i);
            });
            if (allBranches.size === 0) return null;
            const sorted = [...allBranches.entries()].sort((a, b) => (b[1].expIndices.length + b[1].incIndices.length) - (a[1].expIndices.length + a[1].incIndices.length));
            return (
              <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                <p className="text-sm font-medium">Map Branches to {costCenterLabel}s</p>
                <p className="text-xs text-muted-foreground">
                  {sorted.filter(([b]) => !campuses.some((c) => c.name.toLowerCase() === b.toLowerCase() || c.slug?.toLowerCase() === b.toLowerCase())).length > 0
                    ? "Some branch values from the CSV don't match any existing cost center. Map them below or they will default to Corporate."
                    : "All branches matched. You can change mappings below if needed."}
                </p>
                <div className="max-h-60 overflow-auto space-y-1">
                  {sorted.map(([branchName, { expIndices, incIndices }]) => {
                    const totalRows = expIndices.length + incIndices.length;
                    const autoMatch = campuses.find((c) => c.name.toLowerCase() === branchName.toLowerCase() || c.slug?.toLowerCase() === branchName.toLowerCase());
                    const currentVal = (() => {
                      const firstExpOverride = expIndices.length > 0 ? costCenterOverrides[String(expIndices[0])] : undefined;
                      const firstIncOverride = incIndices.length > 0 ? incomeCostCenterOverrides[String(incIndices[0])] : undefined;
                      if (firstExpOverride !== undefined) return firstExpOverride ?? "__corporate__";
                      if (firstIncOverride !== undefined) return firstIncOverride ?? "__corporate__";
                      return autoMatch?.id ?? "__unmatched__";
                    })();
                    const isUnmatched = !autoMatch && currentVal === "__unmatched__";
                    return (
                      <div
                        key={branchName}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm",
                          isUnmatched && "bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{branchName}</span>
                          <span className="text-muted-foreground ml-1">({totalRows} rows)</span>
                          {isUnmatched && <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">No match</span>}
                        </div>
                        <Select
                          value={currentVal === "__unmatched__" ? "__corporate__" : currentVal}
                          onValueChange={(v) => {
                            const ccVal = v === "__corporate__" ? null : v;
                            setCostCenterOverrides((prev) => {
                              const next = { ...prev };
                              for (const idx of expIndices) next[String(idx)] = ccVal;
                              return next;
                            });
                            setIncomeCostCenterOverrides((prev) => {
                              const next = { ...prev };
                              for (const idx of incIndices) next[String(idx)] = ccVal;
                              return next;
                            });
                          }}
                        >
                          <SelectTrigger className={cn("h-8 w-[180px]", isUnmatched && "border-yellow-400")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__corporate__">Corporate</SelectItem>
                            {campuses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {/* Bulk map by pattern */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3 bg-muted/30">
            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs">Bulk map by pattern</Label>
              <Input
                placeholder="e.g. Salary, UPI, NEFT"
                value={bulkMapPattern}
                onChange={(e) => setBulkMapPattern(e.target.value)}
                className="mt-1 h-8"
              />
            </div>
            <div className="w-[100px]">
              <Label className="text-xs">Type</Label>
              <Select value={bulkMapType} onValueChange={(v: "expense" | "income") => setBulkMapType(v)}>
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Label className="text-xs">Map to category</Label>
              <Select value={bulkMapCategoryId} onValueChange={setBulkMapCategoryId}>
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {bulkMapType === "expense"
                    ? expenseCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    : incomeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!bulkMapPattern.trim() || !bulkMapCategoryId}
              onClick={() => {
                const pattern = bulkMapPattern.trim().toLowerCase();
                if (!pattern || !bulkMapCategoryId) return;
                if (bulkMapType === "expense") {
                  setExpenseOverrides((prev) => {
                    const next = { ...prev };
                    expRows.forEach((r, i) => {
                      if (r.particulars?.toLowerCase().includes(pattern)) {
                        next[String(i)] = bulkMapCategoryId;
                      }
                    });
                    return next;
                  });
                  const count = expRows.filter((r) => r.particulars?.toLowerCase().includes(pattern)).length;
                  toast({ title: "Bulk mapping applied", description: `${count} expense rows mapped` });
                } else {
                  setIncomeOverrides((prev) => {
                    const next = { ...prev };
                    incRows.forEach((r, i) => {
                      if (r.particulars?.toLowerCase().includes(pattern)) {
                        next[String(i)] = bulkMapCategoryId;
                      }
                    });
                    return next;
                  });
                  const count = incRows.filter((r) => r.particulars?.toLowerCase().includes(pattern)).length;
                  toast({ title: "Bulk mapping applied", description: `${count} income rows mapped` });
                }
              }}
            >
              Apply
            </Button>
          </div>

          {preview.proposedNewCategories && preview.proposedNewCategories.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">AI-suggested new categories</p>
              <div className="flex flex-wrap gap-2">
                {preview.proposedNewCategories.map((proposed, idx) => {
                  const rowCount = proposed.rowIndices?.length ?? 0;
                  const slugExists = proposed.type === "expense"
                    ? expenseCategories.some((c) => c.slug === proposed.slug)
                    : incomeCategories.some((c) => c.slug === proposed.slug);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{proposed.name}</span>
                      <span className="text-muted-foreground">({rowCount} rows)</span>
                      <span className="text-muted-foreground">— {proposed.reason}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={slugExists || addCategoryMutation.isPending}
                        onClick={() => addCategoryMutation.mutate(proposed)}
                      >
                        {addCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {slugExists ? "Already exists" : "Add and apply"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(skippedExpenseIndices.size > 0 || skippedIncomeIndices.size > 0) && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <span>
                <strong>{skippedExpenseIndices.size + skippedIncomeIndices.size}</strong> of {expRows.length + incRows.length} rows appear to match existing records and will be skipped.
                Uncheck to import anyway.
              </span>
            </div>
          )}
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
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Continue to Summary</Button>
          </div>
        </div>
      )}

      {/* Step 3: Summary & Import */}
      {step === 3 && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Summary</CardTitle>
              <CardDescription>Review and confirm the import</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>{preview.totalRows - skippedExpenseIndices.size}</strong> expenses to import • ₹ {expRows.filter((_, i) => !skippedExpenseIndices.has(i)).reduce((s, r) => s + r.amount, 0).toLocaleString("en-IN")}</p>
              {preview.incomeTotalRows && preview.incomeTotalRows > 0 && (
                <p className="text-green-600 dark:text-green-400">
                  <strong>{(preview.incomeTotalRows ?? 0) - skippedIncomeIndices.size}</strong> income to import • ₹ {incRows.filter((_, i) => !skippedIncomeIndices.has(i)).reduce((s, r) => s + r.amount, 0).toLocaleString("en-IN")}
                </p>
              )}
              {(skippedExpenseIndices.size > 0 || skippedIncomeIndices.size > 0) && (
                <p className="text-yellow-600 dark:text-yellow-400 text-sm">
                  {skippedExpenseIndices.size + skippedIncomeIndices.size} potential duplicate(s) will be skipped
                </p>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button
              onClick={() => file && executeMutation.mutate(file)}
              disabled={executeMutation.isPending || !file}
            >
              {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>
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
  const { user, canApproveExpenses, canImportExpenses } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const { costCenterLabel } = useCostCenterLabel(tenantId);
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
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
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

  const { data: pettyCashFunds = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/petty-cash/funds"],
    queryFn: async () => {
      const res = await fetch("/api/admin/petty-cash/funds");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: canImportExpenses,
  });

  const { data: vendorSuggestions = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/expenses/vendor-suggestions", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expenses/vendor-suggestions${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
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
      setExpenseOffset(0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
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
      setCreateForm({ campusId: "__corporate__", categoryId: "", amount: "", expenseDate: new Date(), description: "", invoiceNumber: "", invoiceDate: "", vendorName: "", gstin: "", taxType: "", voucherNumber: "" });
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
                  {!tenantId && (
                    <p className="text-sm text-muted-foreground">Select a tenant from the dropdown above to import data.</p>
                  )}
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
                      Download Template
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>Update expense details.</DialogDescription>
          </DialogHeader>
          {editExpenseDialog && (
            <EditExpenseForm
              expense={editExpenseDialog}
              categories={categories}
              campuses={campuses}
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
  categories,
  campuses,
  vendorSuggestions = [],
  onSave,
  onCancel,
  isPending,
}: {
  expense: ExpenseWithDetails;
  categories: ExpenseCategory[];
  campuses: Campus[];
  vendorSuggestions?: string[];
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
