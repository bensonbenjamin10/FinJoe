import { useState, useEffect } from "react";
import { Link, useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Plus, Search, Users, Edit, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

type InvoicingCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  isActive: boolean;
  createdAt: string;
};

const CUSTOMERS_QUERY_ROOT = "/api/admin/invoicing/customers";

function buildInvoicingHref(path: string, tenantId: string | null): string {
  if (!tenantId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}tenantId=${encodeURIComponent(tenantId)}`;
}

export default function AdminInvoicingCustomers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : (user?.tenantId ?? null);

  const searchFromUrl = searchParams.get("search") ?? "";
  const [searchDraft, setSearchDraft] = useState(searchFromUrl);

  useEffect(() => {
    setSearchDraft(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === searchFromUrl) return;
    const id = window.setTimeout(() => {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        if (trimmed) next.set("search", trimmed);
        else next.delete("search");
        return next.toString() ? `?${next}` : "";
      });
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchDraft, searchFromUrl, setSearchParams]);

  const [addOpen, setAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<InvoicingCustomer | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", gstin: "" });

  const resetForm = () => setForm({ name: "", email: "", phone: "", address: "", gstin: "" });

  const openAdd = () => {
    resetForm();
    setAddOpen(true);
  };

  const openEdit = (c: InvoicingCustomer) => {
    setEditCustomer(c);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      gstin: c.gstin ?? "",
    });
  };

  const { data: customers = [], isLoading } = useQuery<InvoicingCustomer[]>({
    queryKey: [CUSTOMERS_QUERY_ROOT, tenantId, searchFromUrl],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantId) params.set("tenantId", tenantId);
      if (searchFromUrl.trim()) params.set("search", searchFromUrl.trim());
      const q = params.toString();
      const res = await fetch(`${CUSTOMERS_QUERY_ROOT}${q ? `?${q}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch customers");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Missing tenant");
      const body: Record<string, unknown> = {
        tenantId,
        name: form.name.trim(),
      };
      const email = form.email.trim();
      const phone = form.phone.trim();
      const address = form.address.trim();
      if (email) body.email = email;
      if (phone) body.phone = phone;
      if (address) body.address = address;
      const gstin = form.gstin.trim();
      if (gstin) body.gstin = gstin;
      const res = await apiRequest("POST", CUSTOMERS_QUERY_ROOT, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_ROOT] });
      toast({ title: "Customer created" });
      setAddOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editCustomer) throw new Error("No customer selected");
      const res = await apiRequest("PATCH", `${CUSTOMERS_QUERY_ROOT}/${editCustomer.id}`, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        gstin: form.gstin.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CUSTOMERS_QUERY_ROOT] });
      toast({ title: "Customer updated" });
      setEditCustomer(null);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const invoicingHref = buildInvoicingHref("/admin/invoicing", tenantId);

  const handleSubmitAdd = () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Enter a customer name.", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  const handleSubmitEdit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Enter a customer name.", variant: "destructive" });
      return;
    }
    updateMutation.mutate();
  };

  return (
    <div className="w-full space-y-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={invoicingHref}>Invoicing</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Customers</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Customers"
        actions={
          <Button onClick={openAdd} disabled={!tenantId}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Directory
          </CardTitle>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="pl-9"
              disabled={!tenantId}
              aria-label="Search customers"
            />
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {!tenantId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Select a tenant from the header to view and manage billing customers.
            </p>
          ) : isLoading ? (
            <div className="space-y-3 pt-4">
              <div className="flex gap-4 border-b pb-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                </div>
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 opacity-50" />
              <p className="max-w-sm text-sm">
                No customers yet. Add your first customer to start invoicing.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6 py-4">Name</TableHead>
                    <TableHead className="px-6 py-4">Email</TableHead>
                    <TableHead className="px-6 py-4">Phone</TableHead>
                    <TableHead className="px-6 py-4">GSTIN</TableHead>
                    <TableHead className="px-6 py-4">Created</TableHead>
                    <TableHead className="w-[100px] px-6 py-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="px-6 py-4 font-medium">{c.name}</TableCell>
                      <TableCell className="px-6 py-4 text-muted-foreground">
                        {c.email ?? "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-muted-foreground">
                        {c.phone ?? "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {c.gstin ?? "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-muted-foreground">
                        {(() => {
                          try {
                            return format(new Date(c.createdAt), "dd MMM yyyy");
                          } catch {
                            return c.createdAt;
                          }
                        })()}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(c)}
                          aria-label={`Edit ${c.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
            <DialogDescription>Create a billing customer for this tenant.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
                autoComplete="organization"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-phone">Phone</Label>
              <Input
                id="add-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
                autoComplete="tel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-address">Address</Label>
              <Textarea
                id="add-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Billing address"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-gstin">GSTIN (optional)</Label>
              <Input
                id="add-gstin"
                value={form.gstin}
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                placeholder="15-character GSTIN"
                maxLength={15}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmitAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCustomer} onOpenChange={(o) => !o && setEditCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Update billing details for this customer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
                autoComplete="organization"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
                autoComplete="tel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-address">Address</Label>
              <Textarea
                id="edit-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Billing address"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-gstin">GSTIN (optional)</Label>
              <Input
                id="edit-gstin"
                value={form.gstin}
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                placeholder="15-character GSTIN"
                maxLength={15}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditCustomer(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmitEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
