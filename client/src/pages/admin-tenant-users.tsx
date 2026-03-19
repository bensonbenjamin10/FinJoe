import { useState } from "react";
import { useRoute } from "wouter";
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
import { Link } from "wouter";
import { Plus, Users, Loader2, Edit } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

type TenantUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  createdByName?: string | null;
  updatedByName?: string | null;
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
};

export default function AdminTenantUsers() {
  const [, params] = useRoute("/admin/tenants/:id/users");
  const { toast } = useToast();
  const tenantId = params?.id ?? "";

  const [createAdminDialog, setCreateAdminDialog] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState<TenantUser | null>(null);
  const [adminForm, setAdminForm] = useState({ email: "", password: "", name: "" });
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", isActive: true, password: "" });

  const { data: tenant, isLoading: tenantLoading } = useQuery<Tenant>({
    queryKey: ["/api/admin/tenants", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Tenant not found");
        throw new Error("Failed to fetch");
      }
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<TenantUser[]>({
    queryKey: ["/api/admin/tenants", tenantId, "users"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/users`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: typeof adminForm) => {
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantId}/create-admin`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create admin");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "users"] });
      toast({ title: "User created" });
      setCreateAdminDialog(false);
      setAdminForm({ email: "", password: "", name: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof editUserForm> }) => {
      const payload: Record<string, unknown> = { name: data.name, email: data.email, isActive: data.isActive };
      if (data.password?.trim()) payload.password = data.password;
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, payload);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "users"] });
      toast({ title: "User updated" });
      setEditUserDialog(null);
      setEditUserForm({ name: "", email: "", isActive: true, password: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEditUser = (u: TenantUser) => {
    setEditUserDialog(u);
    setEditUserForm({ name: u.name, email: u.email, isActive: u.isActive, password: "" });
  };

  return (
    <>
      <div className="w-full space-y-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admin/tenants">Tenants</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{tenant?.name ?? "Tenant"}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Users</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader
          title={`${tenant?.name ?? "Tenant"} Users`}
          description="Manage users who can access this tenant's FinJoe admin."
          actions={
            <Button onClick={() => setCreateAdminDialog(true)} disabled={!tenantId}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          }
        />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {tenantLoading || usersLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No users yet. Add an admin to get started.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6 py-4">Email</TableHead>
                      <TableHead className="px-6 py-4">Name</TableHead>
                      <TableHead className="px-6 py-4">Role</TableHead>
                      <TableHead className="px-6 py-4">Status</TableHead>
                      <TableHead className="px-6 py-4">Created</TableHead>
                      <TableHead className="w-[100px] px-6 py-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="px-6 py-4">{u.email}</TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span>{u.name}</span>
                            {(u.createdByName || u.updatedByName) && (
                              <span 
                                className="text-xs text-muted-foreground cursor-help"
                                title={`Created by: ${u.createdByName || 'Unknown'}\nUpdated by: ${u.updatedByName || 'Unknown'}`}
                              >
                                {u.updatedByName ? `Upd: ${u.updatedByName}` : `By: ${u.createdByName}`}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span className="capitalize">{u.role}</span>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          {u.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4">{format(new Date(u.createdAt), "dd MMM yyyy")}</TableCell>
                        <TableCell className="px-6 py-4">
                          <Button variant="outline" size="sm" onClick={() => openEditUser(u)}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
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
      </div>

      <Dialog open={createAdminDialog} onOpenChange={setCreateAdminDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create an admin user for {tenant?.name}. They will manage this tenant's FinJoe.
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
            <Button variant="outline" onClick={() => setCreateAdminDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createAdminMutation.mutate(adminForm)}
              disabled={!adminForm.email.trim() || !adminForm.password || createAdminMutation.isPending}
            >
              {createAdminMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUserDialog} onOpenChange={() => setEditUserDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details. Leave password blank to keep the current password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="admin@acme.com"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                placeholder="Admin User"
                value={editUserForm.name}
                onChange={(e) => setEditUserForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>New password (optional)</Label>
              <Input
                type="password"
                placeholder="Leave blank to keep current"
                value={editUserForm.password}
                onChange={(e) => setEditUserForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-user-active"
                checked={editUserForm.isActive}
                onCheckedChange={(v) => setEditUserForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="edit-user-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditUserDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editUserDialog &&
                updateUserMutation.mutate({
                  id: editUserDialog.id,
                  data: editUserForm,
                })
              }
              disabled={!editUserForm.email.trim() || !editUserForm.name.trim() || updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
