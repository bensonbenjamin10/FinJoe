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
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Building2,
  UserPlus,
  Loader2,
  Edit,
  Trash2,
  Users,
  MoreVertical,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Tenant } from "@shared/schema";

export default function AdminTenants() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createTenantDialog, setCreateTenantDialog] = useState(false);
  const [editTenantDialog, setEditTenantDialog] = useState<Tenant | null>(null);
  const [deleteTenantDialog, setDeleteTenantDialog] = useState<Tenant | null>(null);
  const [createAdminDialog, setCreateAdminDialog] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ name: "", slug: "" });
  const [editTenantForm, setEditTenantForm] = useState({ name: "", slug: "", isActive: true });
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

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editTenantForm }) => {
      const res = await apiRequest("PATCH", `/api/admin/tenants/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant updated" });
      setEditTenantDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/tenants/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant deactivated" });
      setDeleteTenantDialog(null);
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

  const handleEditTenant = () => {
    if (!editTenantDialog) return;
    updateTenantMutation.mutate({ id: editTenantDialog.id, data: editTenantForm });
  };

  const openEditTenant = (t: Tenant) => {
    setEditTenantDialog(t);
    setEditTenantForm({ name: t.name, slug: t.slug, isActive: t.isActive });
  };

  return (
    <>
      <div className="w-full space-y-6">
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
          </CardHeader>
          <CardContent className="p-6">
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
                    <TableHead className="px-6 py-4">Name</TableHead>
                    <TableHead className="px-6 py-4">Slug</TableHead>
                    <TableHead className="px-6 py-4">Status</TableHead>
                    <TableHead className="w-[140px] px-6 py-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="px-6 py-4">{t.name}</TableCell>
                      <TableCell className="font-mono text-sm px-6 py-4">{t.slug}</TableCell>
                      <TableCell className="px-6 py-4">
                        {t.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 font-medium"
                            onClick={() => setLocation(`/admin/finjoe?tenantId=${t.id}`)}
                          >
                            Manage
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setLocation(`/admin/tenants/${t.id}/users`)}>
                                <Users className="h-4 w-4 mr-2" />
                                Users
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditTenant(t)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setCreateAdminDialog(t);
                                  setAdminForm({ email: "", password: "", name: "" });
                                }}
                              >
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Admin
                              </DropdownMenuItem>
                              {t.id !== "default" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTenantDialog(t)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Deactivate
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <Dialog open={!!editTenantDialog} onOpenChange={() => setEditTenantDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Update tenant details. Changes take effect immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                placeholder="Acme Corp"
                value={editTenantForm.name}
                onChange={(e) => {
                  setEditTenantForm((f) => ({
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
                value={editTenantForm.slug}
                onChange={(e) => setEditTenantForm((f) => ({ ...f, slug: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">URL-friendly identifier (lowercase, hyphens only)</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-tenant-active"
                checked={editTenantForm.isActive}
                onCheckedChange={(v) => setEditTenantForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="edit-tenant-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTenantDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditTenant}
              disabled={!editTenantForm.name.trim() || updateTenantMutation.isPending}
            >
              {updateTenantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTenantDialog} onOpenChange={() => setDeleteTenantDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Tenant</DialogTitle>
            <DialogDescription>
              Deactivate {deleteTenantDialog?.name}? This will set the tenant as inactive. Users will not be able to
              access this tenant. You can reactivate it later by editing the tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTenantDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTenantDialog && deleteTenantMutation.mutate(deleteTenantDialog.id)}
              disabled={deleteTenantMutation.isPending}
            >
              {deleteTenantMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Deactivate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
