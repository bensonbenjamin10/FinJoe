import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Building2, UserPlus, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Tenant } from "@shared/schema";

export default function AdminTenants() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createTenantDialog, setCreateTenantDialog] = useState(false);
  const [createAdminDialog, setCreateAdminDialog] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ name: "", slug: "" });
  const [adminForm, setAdminForm] = useState({ email: "", password: "", name: "" });

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const res = await apiRequest("POST", "/api/admin/tenants", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant created" });
      setCreateTenantDialog(false);
      setTenantForm({ name: "", slug: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createAdminMutation = useMutation({
    mutationFn: async ({ tenantId, data }: { tenantId: string; data: typeof adminForm }) => {
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantId}/create-admin`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create admin");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant admin created" });
      setCreateAdminDialog(null);
      setAdminForm({ email: "", password: "", name: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreateTenant = () => {
    const slug = tenantForm.slug.trim() || tenantForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    createTenantMutation.mutate({ name: tenantForm.name.trim(), slug });
  };

  const handleCreateAdmin = () => {
    if (!createAdminDialog) return;
    createAdminMutation.mutate({
      tenantId: createAdminDialog.id,
      data: adminForm,
    });
  };

  return (
    <AdminLayout
      headerActions={
        <Button variant="outline" size="sm" onClick={() => setLocation("/admin/finjoe")}>
          Back to FinJoe
        </Button>
      }
      title="Tenant Management"
    >
      <div className="max-w-4xl">
        <PageHeader
          title="Tenant Management"
          description="Create and manage organizations. Each tenant has its own FinJoe instance with separate contacts and WhatsApp settings."
          actions={
            <Button onClick={() => setCreateTenantDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          }
        />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Tenants
            </CardTitle>
            <CardDescription>
              Each tenant gets its own FinJoe instance with separate contacts and settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tenants.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No tenants yet. Create one to get started.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell className="font-mono text-sm">{t.slug}</TableCell>
                      <TableCell>
                        {t.isActive ? (
                          <span className="text-green-600">Active</span>
                        ) : (
                          <span className="text-muted-foreground">Inactive</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] sm:min-h-0"
                            onClick={() => setLocation(`/admin/finjoe?tenantId=${t.id}`)}
                          >
                            Manage
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] sm:min-h-0"
                            onClick={() => {
                              setCreateAdminDialog(t);
                              setAdminForm({ email: "", password: "", name: "" });
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Add Admin
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createTenantDialog} onOpenChange={setCreateTenantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tenant</DialogTitle>
            <DialogDescription>
              Add a new organization. Each tenant gets its own FinJoe instance with separate contacts and settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                placeholder="Acme Corp"
                value={tenantForm.name}
                onChange={(e) => {
                  setTenantForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                  }));
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Slug</Label>
              <Input
                placeholder="acme-corp"
                value={tenantForm.slug}
                onChange={(e) => setTenantForm((f) => ({ ...f, slug: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">URL-friendly identifier (lowercase, hyphens only)</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateTenantDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTenant}
              disabled={!tenantForm.name.trim() || createTenantMutation.isPending}
            >
              {createTenantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createAdminDialog} onOpenChange={() => setCreateAdminDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tenant Admin</DialogTitle>
            <DialogDescription>
              Create an admin user for {createAdminDialog?.name}. They will manage this tenant's FinJoe.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="admin@acme.com"
                value={adminForm.email}
                onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={adminForm.password}
                onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Name (optional)</Label>
              <Input
                placeholder="Admin User"
                value={adminForm.name}
                onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateAdminDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateAdmin}
              disabled={!adminForm.email.trim() || !adminForm.password || createAdminMutation.isPending}
            >
              {createAdminMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Admin
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
