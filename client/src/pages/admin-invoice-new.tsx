import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { Check, ChevronsUpDown, Loader2, Plus, UserPlus, X } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type Customer = { id: string; name: string; email: string | null; phone: string | null };
type IncomeCategoryRow = { id: string; name: string };

type LineRow = {
  key: string;
  description: string;
  quantity: string;
  unitAmount: string;
  taxRate: string;
};

function newLine(): LineRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description: "",
    quantity: "1",
    unitAmount: "",
    taxRate: "0",
  };
}

function parseNum(s: string): number | null {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : null;
}

function calcLineParts(qty: string, unit: string, taxPct: string) {
  const q = parseNum(qty);
  const u = parseNum(unit);
  const t = parseNum(taxPct) ?? 0;
  if (q === null || u === null || q <= 0 || u <= 0) {
    return { sub: 0, tax: 0, total: 0 };
  }
  const sub = Math.round(q * u);
  const tax = Math.round((sub * t) / 100);
  return { sub, tax, total: sub + tax };
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatInr(paiseLike: number) {
  return inr.format(paiseLike);
}

export default function AdminInvoiceNew() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();

  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? urlTenantId || user?.tenantId || null : user?.tenantId ?? null;

  const tenantQuery = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const [customerId, setCustomerId] = useState<string>("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [issueDate, setIssueDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(() => format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [incomeCategoryId, setIncomeCategoryId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/admin/invoicing/customers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoicing/customers${tenantQuery}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: incomeCategories = [], isLoading: categoriesLoading } = useQuery<IncomeCategoryRow[]>({
    queryKey: ["/api/admin/income-categories", tenantId, "invoice-new"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/income-categories${tenantQuery}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load categories");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of lines) {
      const { sub, tax: lt } = calcLineParts(line.quantity, line.unitAmount, line.taxRate);
      subtotal += sub;
      tax += lt;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const createCustomerMutation = useMutation({
    mutationFn: async (body: { tenantId: string; name: string; email?: string; phone?: string }) => {
      const res = await apiRequest("POST", "/api/admin/invoicing/customers", body);
      return res.json() as Promise<Customer>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoicing/customers", tenantId] });
      setCustomerId(created.id);
      setAddCustomerOpen(false);
      setNewCustomer({ name: "", email: "", phone: "" });
      toast({ title: "Customer created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveInvoiceMutation = useMutation({
    mutationFn: async (issueAfter: boolean) => {
      if (!tenantId) throw new Error("Tenant is required");

      if (!customerId) throw new Error("Select a customer");
      if (lines.length < 1) throw new Error("Add at least one line item");

      const payloadLines: { description: string; quantity: number; unitAmount: number; taxRate?: number }[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const desc = line.description.trim();
        if (!desc) throw new Error(`Line ${i + 1}: description is required`);
        const quantity = parseNum(line.quantity);
        const unitAmount = parseNum(line.unitAmount);
        const taxRate = parseNum(line.taxRate) ?? 0;
        if (quantity === null || quantity <= 0) throw new Error(`Line ${i + 1}: quantity must be greater than 0`);
        if (unitAmount === null || unitAmount <= 0)
          throw new Error(`Line ${i + 1}: unit price must be greater than 0`);
        payloadLines.push({
          description: desc,
          quantity,
          unitAmount,
          taxRate: taxRate > 0 ? taxRate : undefined,
        });
      }

      const body: Record<string, unknown> = {
        tenantId,
        customerId,
        issueDate: issueDate || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        incomeCategoryId: incomeCategoryId || undefined,
        lines: payloadLines,
      };

      const res = await apiRequest("POST", "/api/admin/invoicing/invoices", body);
      const invoice = (await res.json()) as { id: string };

      if (issueAfter) {
        await apiRequest("POST", `/api/admin/invoicing/invoices/${invoice.id}/issue`, { tenantId });
      }

      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invoicing/invoices", tenantId] });
      const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      setLocation(`/admin/invoicing/${invoice.id}${q}`);
    },
    onError: (e: Error) => toast({ title: "Could not save invoice", description: e.message, variant: "destructive" }),
  });

  const invoicingListHref = `/admin/invoicing${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`;

  const updateLine = (key: string, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const submitAddCustomer = () => {
    const name = newCustomer.name.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!tenantId) return;
    createCustomerMutation.mutate({
      tenantId,
      name,
      email: newCustomer.email.trim() || undefined,
      phone: newCustomer.phone.trim() || undefined,
    });
  };

  const busy = saveInvoiceMutation.isPending;

  if (!tenantId) {
    return (
      <div className="w-full space-y-6">
        <PageHeader
          title="New Invoice"
          description={
            isSuperAdmin
              ? "Choose a tenant from the shell or add ?tenantId= to the URL."
              : "No tenant context available."
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={invoicingListHref}>Invoicing</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Invoice</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="New Invoice"
        description={`Issue date defaults to ${format(new Date(issueDate), "dd MMM yyyy")}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => saveInvoiceMutation.mutate(false)}
            >
              {busy && saveInvoiceMutation.variables === false ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Draft
            </Button>
            <Button type="button" disabled={busy} onClick={() => saveInvoiceMutation.mutate(true)}>
              {busy && saveInvoiceMutation.variables === true ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save &amp; Issue
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer &amp; details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label>Customer</Label>
                  <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerPopoverOpen}
                        className="w-full justify-between font-normal"
                        disabled={customersLoading}
                      >
                        {selectedCustomer ? selectedCustomer.name : "Search or select customer…"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search customers…" />
                        <CommandList>
                          <CommandEmpty>
                            {customersLoading ? "Loading…" : "No customer found."}
                          </CommandEmpty>
                          <CommandGroup>
                            {customers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.name} ${c.email ?? ""} ${c.phone ?? ""}`}
                                onSelect={() => {
                                  setCustomerId(c.id);
                                  setCustomerPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    customerId === c.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{c.name}</span>
                                  {(c.email || c.phone) && (
                                    <span className="text-xs text-muted-foreground">
                                      {[c.email, c.phone].filter(Boolean).join(" · ")}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="sm:shrink-0"
                  onClick={() => setAddCustomerOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="issue-date">Issue date</Label>
                  <Input
                    id="issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due-date">Due date</Label>
                  <Input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Income category</Label>
                <Select
                  value={incomeCategoryId || "__none__"}
                  onValueChange={(v) => setIncomeCategoryId(v === "__none__" ? "" : v)}
                  disabled={categoriesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {incomeCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Optional notes on this invoice"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Line items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add line
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead className="w-[90px]">Qty</TableHead>
                    <TableHead className="w-[120px]">Unit price</TableHead>
                    <TableHead className="w-[100px]">Tax %</TableHead>
                    <TableHead className="w-[120px] text-right">Line total</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const { total: lineTotal } = calcLineParts(line.quantity, line.unitAmount, line.taxRate);
                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <Input
                            placeholder={`Item ${idx + 1}`}
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={line.unitAmount}
                            onChange={(e) => updateLine(line.key, { unitAmount: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={line.taxRate}
                            onChange={(e) => updateLine(line.key, { taxRate: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatInr(lineTotal)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={lines.length <= 1}
                            onClick={() => removeLine(line.key)}
                            aria-label="Remove line"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{formatInr(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium tabular-nums">{formatInr(totals.tax)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatInr(totals.total)}</span>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => saveInvoiceMutation.mutate(false)}
              >
                {busy && saveInvoiceMutation.variables === false ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save Draft
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => saveInvoiceMutation.mutate(true)}
              >
                {busy && saveInvoiceMutation.variables === true ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save &amp; Issue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>Create a billing customer for this tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="nc-name">Name</Label>
              <Input
                id="nc-name"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-email">Email (optional)</Label>
              <Input
                id="nc-email"
                type="email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-phone">Phone (optional)</Label>
              <Input
                id="nc-phone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitAddCustomer} disabled={createCustomerMutation.isPending}>
              {createCustomerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
