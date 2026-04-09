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
import { FINJOE_PATHS, finjoePathWithTenant } from "@/lib/finjoe-routes";
import { Checkbox } from "@/components/ui/checkbox";

export default function AdminTenants() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardTenantId, setWizardTenantId] = useState<string | null>(null);
  const [wizardAdminForm, setWizardAdminForm] = useState({ email: "", password: "", name: "" });
  const [wizardIntegrate, setWizardIntegrate] = useState({
    accountSid: "",
    authToken: "",
    whatsappFrom: "",
    notificationEmails: "",
    resendFromEmail: "",
    seedMis: false,
  });
  const [editTenantDialog, setEditTenantDialog] = useState<Tenant | null>(null);
  const [deleteTenantDialog, setDeleteTenantDialog] = useState<Tenant | null>(null);
  const [createAdminDialog, setCreateAdminDialog] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ name: "", slug: "" });
  const [editTenantForm, setEditTenantForm] = useState({ name: "", slug: "", isActive: true });
  const [adminForm, setAdminForm] = useState({ email: "", password: "", name: "" });

  const resetCreateWizard = () => {
    setWizardStep(1);
    setWizardTenantId(null);
    setTenantForm({ name: "", slug: "" });
    setWizardAdminForm({ email: "", password: "", name: "" });
    setWizardIntegrate({
      accountSid: "",
      authToken: "",
      whatsappFrom: "",
      notificationEmails: "",
      resendFromEmail: "",
      seedMis: false,
    });
  };

  const handleCreateWizardOpenChange = (open: boolean) => {
    setCreateWizardOpen(open);
    if (!open) resetCreateWizard();
  };

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const wizardCreateTenantMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const res = await apiRequest("POST", "/api/admin/tenants", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json() as Promise<Tenant>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setWizardTenantId(created.id);
      setWizardStep(2);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const wizardCreateAdminMutation = useMutation({
    mutationFn: async ({ tenantId, data }: { tenantId: string; data: typeof wizardAdminForm }) => {
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantId}/create-admin`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create admin");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setWizardStep(3);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const wizardFinishMutation = useMutation({
    mutationFn: async ({
      tenantId,
      integrate,
    }: {
      tenantId: string;
      integrate: typeof wizardIntegrate;
    }) => {
      const { accountSid, authToken, whatsappFrom, notificationEmails, resendFromEmail, seedMis } = integrate;
      const hasWa = Boolean(accountSid.trim() && whatsappFrom.trim());
      if (hasWa && !authToken.trim()) {
        throw new Error("Auth token is required when configuring WhatsApp for a new tenant");
      }
      if (hasWa) {
        const waRes = await apiRequest("PUT", "/api/admin/finjoe/whatsapp-provider", {
          tenantId,
          accountSid: accountSid.trim(),
          authToken: authToken.trim() || undefined,
          whatsappFrom: whatsappFrom.trim(),
        });
        if (!waRes.ok) {
          const err = await waRes.json();
          throw new Error(err.error || "Failed to save WhatsApp provider");
        }
      }
      if (notificationEmails.trim() || resendFromEmail.trim()) {
        const fsRes = await apiRequest("PATCH", "/api/admin/finjoe/settings", {
          tenantId,
          notificationEmails: notificationEmails.trim() || null,
          resendFromEmail: resendFromEmail.trim() || null,
        });
        if (!fsRes.ok) {
          const err = await fsRes.json();
          throw new Error(err.error || "Failed to save FinJoe settings");
        }
      }
      if (seedMis) {
        const seedRes = await apiRequest("POST", `/api/admin/tenants/${tenantId}/seed-mis`, {});
        if (!seedRes.ok) {
          const err = await seedRes.json();
          throw new Error(err.error || "Failed to seed MIS categories");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Tenant onboarded" });
      setCreateWizardOpen(false);
      resetCreateWizard();
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

  const handleWizardStep1Next = () => {
    const slug = tenantForm.slug.trim() || tenantForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    wizardCreateTenantMutation.mutate({ name: tenantForm.name.trim(), slug });
  };

  const handleWizardStep2Next = () => {
    if (!wizardTenantId) return;
    wizardCreateAdminMutation.mutate({ tenantId: wizardTenantId, data: wizardAdminForm });
  };

  const handleWizardFinish = () => {
    if (!wizardTenantId) return;
    wizardFinishMutation.mutate({ tenantId: wizardTenantId, integrate: wizardIntegrate });
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
            <Button onClick={() => setCreateWizardOpen(true)}>
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
                            onClick={() =>
                              setLocation(finjoePathWithTenant(FINJOE_PATHS.structureCostCenters, t.id, true))
                            }
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

      <Dialog open={createWizardOpen} onOpenChange={handleCreateWizardOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {wizardStep === 1 && "Create tenant — Organization"}
              {wizardStep === 2 && "Create tenant — Admin user"}
              {wizardStep === 3 && "Create tenant — WhatsApp & notifications"}
            </DialogTitle>
            <DialogDescription>
              Step {wizardStep} of 3 — Add a new organization, then optionally configure Twilio and FinJoe defaults.
            </DialogDescription>
          </DialogHeader>

          {wizardStep === 1 && (
            <>
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
                <Button variant="outline" onClick={() => setCreateWizardOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleWizardStep1Next}
                  disabled={!tenantForm.name.trim() || wizardCreateTenantMutation.isPending}
                >
                  {wizardCreateTenantMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Next
                </Button>
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="admin@acme.com"
                    value={wizardAdminForm.email}
                    onChange={(e) => setWizardAdminForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={wizardAdminForm.password}
                    onChange={(e) => setWizardAdminForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Name (optional)</Label>
                  <Input
                    placeholder="Admin User"
                    value={wizardAdminForm.name}
                    onChange={(e) => setWizardAdminForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setWizardStep(1)}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setWizardStep(3)}>
                    Skip admin
                  </Button>
                  <Button
                    onClick={handleWizardStep2Next}
                    disabled={
                      !wizardAdminForm.email.trim() ||
                      !wizardAdminForm.password ||
                      wizardCreateAdminMutation.isPending
                    }
                  >
                    {wizardCreateAdminMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}

          {wizardStep === 3 && (
            <>
              <div className="grid gap-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Twilio WhatsApp (optional). New providers require Account SID, Auth Token, and WhatsApp sender.
                </p>
                <div className="grid gap-2">
                  <Label>Twilio Account SID</Label>
                  <Input
                    placeholder="ACxxxxxxxx"
                    value={wizardIntegrate.accountSid}
                    onChange={(e) => setWizardIntegrate((f) => ({ ...f, accountSid: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Auth token</Label>
                  <Input
                    type="password"
                    placeholder="Required for new provider"
                    value={wizardIntegrate.authToken}
                    onChange={(e) => setWizardIntegrate((f) => ({ ...f, authToken: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>WhatsApp from</Label>
                  <Input
                    placeholder="+14155238886 or whatsapp:+1..."
                    value={wizardIntegrate.whatsappFrom}
                    onChange={(e) => setWizardIntegrate((f) => ({ ...f, whatsappFrom: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Notification emails (comma-separated)</Label>
                  <Input
                    placeholder="finance@acme.com"
                    value={wizardIntegrate.notificationEmails}
                    onChange={(e) => setWizardIntegrate((f) => ({ ...f, notificationEmails: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Resend from email</Label>
                  <Input
                    placeholder="FinJoe &lt;notifications@domain.com&gt;"
                    value={wizardIntegrate.resendFromEmail}
                    onChange={(e) => setWizardIntegrate((f) => ({ ...f, resendFromEmail: e.target.value }))}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="seed-mis"
                    checked={wizardIntegrate.seedMis}
                    onCheckedChange={(v) => setWizardIntegrate((f) => ({ ...f, seedMis: v === true }))}
                  />
                  <label
                    htmlFor="seed-mis"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Run MIS category seed (usually already done when the tenant was created)
                  </label>
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setWizardStep(2)}>
                  Back
                </Button>
                <Button onClick={handleWizardFinish} disabled={wizardFinishMutation.isPending}>
                  {wizardFinishMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Finish
                </Button>
              </div>
            </>
          )}
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
