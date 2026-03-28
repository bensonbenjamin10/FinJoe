import { useState, useRef, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ExpenseCategory, Campus } from "@shared/schema";

export type ImportPreviewRow = {
  date: string | null;
  dateRaw?: string;
  particulars: string;
  amount: number;
  majorHead?: string;
  branch?: string;
  categoryMatch: string;
  potentialDuplicate?: boolean;
  matchConfidence?: "exact" | "probable";
  matchedExpenseId?: string;
  matchedExpenseStatus?: string;
  matchedExpenseSource?: string;
};
export type ImportIncomePreviewRow = {
  date: string | null;
  dateRaw?: string;
  particulars: string;
  amount: number;
  majorHead?: string;
  branch?: string;
  categoryMatch: string;
  potentialDuplicate?: boolean;
  matchConfidence?: "exact" | "probable";
  matchedExpenseId?: string;
  matchedExpenseSource?: string;
};

function importPreviewDateCell(r: { date?: string | null; dateRaw?: string }): { label: string; title?: string } {
  if (r.date) return { label: r.date };
  const raw = r.dateRaw?.trim();
  if (raw) return { label: "No date", title: `Unparsed CSV date: ${raw}` };
  return { label: "No date", title: "Date column empty or missing" };
}

const ROW_HEIGHT = 52;

export function ImportPreviewVirtualizedRows({
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
  expRows: ImportPreviewRow[];
  incRows: ImportIncomePreviewRow[];
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
    const items: Array<{ type: "expense" | "income"; index: number; row: ImportPreviewRow | ImportIncomePreviewRow }> = [];
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
      <div ref={parentRef} className="max-h-80 overflow-auto">
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
              const r = item.row as ImportPreviewRow;
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
                      onChange={() =>
                        setSkippedExpenseIndices((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
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
                  <div className="truncate min-w-0 text-sm" title={r.particulars}>
                    {r.particulars}
                  </div>
                  <div className="text-sm">₹ {r.amount.toLocaleString("en-IN")}</div>
                  <div className="min-w-0">
                    <Select
                      value={
                        costCenterOverrides[String(i)] !== undefined
                          ? (costCenterOverrides[String(i)] ?? "__corporate__")
                          : r.branch
                            ? campuses.find(
                                (c) =>
                                  c.name.toLowerCase() === r.branch?.toLowerCase() || c.slug?.toLowerCase() === r.branch?.toLowerCase()
                              )?.id ?? "__corporate__"
                            : "__corporate__"
                      }
                      onValueChange={(v) => setCostCenterOverrides((o) => ({ ...o, [String(i)]: v === "__corporate__" ? null : v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[130px]">
                        <SelectValue />
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
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            } else {
              const r = item.row as ImportIncomePreviewRow;
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
                      onChange={() =>
                        setSkippedIncomeIndices((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
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
                  <div className="truncate min-w-0 text-sm" title={r.particulars}>
                    {r.particulars}
                  </div>
                  <div className="text-green-600 text-sm">₹ {r.amount.toLocaleString("en-IN")}</div>
                  <div className="min-w-0">
                    <Select
                      value={
                        incomeCostCenterOverrides[String(i)] !== undefined
                          ? (incomeCostCenterOverrides[String(i)] ?? "__corporate__")
                          : r.branch
                            ? campuses.find(
                                (c) =>
                                  c.name.toLowerCase() === r.branch?.toLowerCase() || c.slug?.toLowerCase() === r.branch?.toLowerCase()
                              )?.id ?? "__corporate__"
                            : "__corporate__"
                      }
                      onValueChange={(v) => setIncomeCostCenterOverrides((o) => ({ ...o, [String(i)]: v === "__corporate__" ? null : v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[130px]">
                        <SelectValue />
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
                  <div className="min-w-0">
                    <Select
                      value={
                        incomeOverrides[String(i)] ??
                        slugToIncCatId[r.categoryMatch] ??
                        incomeCategories[0]?.id ??
                        (incomeCategories.length === 0 ? "__skip__" : "")
                      }
                      onValueChange={(v) => setIncomeOverrides((o) => ({ ...o, [String(i)]: v === "__skip__" ? "" : v }))}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {incomeCategories.length === 0 ? (
                          <SelectItem value="__skip__" disabled>
                            Add categories in Income page
                          </SelectItem>
                        ) : (
                          incomeCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
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

export function ImportWizard({
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
  const { toast } = useToast();
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
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
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
      (data.preview ?? []).forEach((r: ImportPreviewRow, i: number) => {
        if (r.potentialDuplicate) autoSkipExp.add(i);
      });
      setSkippedExpenseIndices(autoSkipExp);
      const autoSkipInc = new Set<number>();
      (data.incomePreview ?? []).forEach((r: ImportIncomePreviewRow, i: number) => {
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
      const msg =
        data.incomeImported > 0
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
            const sorted = [...allBranches.entries()].sort(
              (a, b) => b[1].expIndices.length + b[1].incIndices.length - (a[1].expIndices.length + a[1].incIndices.length)
            );
            return (
              <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                <p className="text-sm font-medium">Map Branches to {costCenterLabel}s</p>
                <p className="text-xs text-muted-foreground">
                  {sorted.filter(([b]) => !campuses.some((c) => c.name.toLowerCase() === b.toLowerCase() || c.slug?.toLowerCase() === b.toLowerCase()))
                    .length > 0
                    ? "Some branch values from the CSV don't match any existing cost center. Map them below or they will default to Corporate."
                    : "All branches matched. You can change mappings below if needed."}
                </p>
                <div className="max-h-60 overflow-auto space-y-1">
                  {sorted.map(([branchName, { expIndices, incIndices }]) => {
                    const totalRows = expIndices.length + incIndices.length;
                    const autoMatch = campuses.find(
                      (c) => c.name.toLowerCase() === branchName.toLowerCase() || c.slug?.toLowerCase() === branchName.toLowerCase()
                    );
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
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
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
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))
                    : incomeCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
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
                  const slugExists =
                    proposed.type === "expense"
                      ? expenseCategories.some((c) => c.slug === proposed.slug)
                      : incomeCategories.some((c) => c.slug === proposed.slug);
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
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
                <strong>{skippedExpenseIndices.size + skippedIncomeIndices.size}</strong> of {expRows.length + incRows.length} rows appear to match
                existing records and will be skipped. Uncheck to import anyway.
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
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Continue to Summary</Button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Summary</CardTitle>
              <CardDescription>Review and confirm the import</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <strong>{preview.totalRows - skippedExpenseIndices.size}</strong> expenses to import • ₹{" "}
                {expRows.filter((_, i) => !skippedExpenseIndices.has(i)).reduce((s, r) => s + r.amount, 0).toLocaleString("en-IN")}
              </p>
              {preview.incomeTotalRows && preview.incomeTotalRows > 0 && (
                <p className="text-green-600 dark:text-green-400">
                  <strong>{(preview.incomeTotalRows ?? 0) - skippedIncomeIndices.size}</strong> income to import • ₹{" "}
                  {incRows.filter((_, i) => !skippedIncomeIndices.has(i)).reduce((s, r) => s + r.amount, 0).toLocaleString("en-IN")}
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
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => file && executeMutation.mutate(file)} disabled={executeMutation.isPending || !file}>
              {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
