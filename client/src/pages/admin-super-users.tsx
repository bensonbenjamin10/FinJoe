import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Edit, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Tenant } from "@shared/schema";

const TENANT_ROLES = ["admin", "finance", "campus_coordinator", "head_office"] as const;

type CrossTenantUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
};

export default function AdminSuperUsers() {
  const { toast } = useToast();
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<CrossTenantUser | null>(null);

  const [createForm, setCreateForm] = useState({
    tenantId: "",
    email: "",
    password: "",
    name: "",
    role: "admin" as (typeof TENANT_ROLES)[number],
  });

  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    isActive: true,
    password: "",
    role: "admin" as (typeof TENANT_ROLES)[number],
  });

  const { data: tenantList = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const usersQueryKey = ["/api/admin/users", tenantFilter === "all" ? "" : tenantFilter] as const;

  const { data: users = [], isLoading } = useQuery<CrossTenantUser[]>({
    queryKey: usersQueryKey,
    queryFn: async () => {
      const q =
        tenantFilter !== "all" ? `?tenantId=${encodeURIComponent(tenantFilter)}` : "";
      const res = await fetch(`/api/admin/users${q}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { tenantId, email, password, name, role } = createForm;
      if (!tenantId || !email.trim() || !password) throw new Error("Fill required fields");
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantId}/create-admin`, {
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        role,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created" });
      setCreateOpen(false);
      setCreateForm({ tenantId: "", email: "", password: "", name: "", role: "admin" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      includeRole,
    }: {
      id: string;
      data: typeof editForm;
      includeRole: boolean;
    }) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        isActive: data.isActive,
      };
      if (includeRole) payload.role = data.role;
      if (data.password?.trim()) payload.password = data.password;
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, payload);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "User updated" });
      setEditUser(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (u: CrossTenantUser) => {
    setEditUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      password: "",
      role: (TENANT_ROLES.includes(u.role as (typeof TENANT_ROLES)[number])
        ? u.role
        : "admin") as (typeof TENANT_ROLES)[number],
    });
  };

  return (
    <>
      <div className="w-full space-y-6">
        <PageHeader
          title="Tenant users"
          description="Manage dashboard users across all organizations. Filter by tenant or add users to a workspace."
          actions={
            <Button
              onClick={() => {
                setCreateForm((f) => ({
                  ...f,
                  tenantId: tenantFilter !== "all" ? tenantFilter : f.tenantId || tenantList[0]?.id || "",
                }));
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add user
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-muted-foreground shrink-0">Tenant</Label>
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="w-[min(100%,280px)]">
              <SelectValue placeholder="All tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenantList.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No users match this filter.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-6 py-4">Email</TableHead>
                      <TableHead className="px-6 py-4">Name</TableHead>
                      <TableHead className="px-6 py-4">Tenant</TableHead>
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
                        <TableCell className="px-6 py-4">{u.name}</TableCell>
                        <TableCell className="px-6 py-4">
                          {u.tenantName ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="px-6 py-4 capitalize">{u.role.replace(/_/g, " ")}</TableCell>
                        <TableCell className="px-6 py-4">
                          {u.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-muted-foreground text-sm">
                          {format(new Date(u.createdAt), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Create a dashboard user for a tenant.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Tenant</Label>
              <Select
                value={createForm.tenantId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, tenantId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantList.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, role: v as (typeof TENANT_ROLES)[number] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Name (optional)</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                !createForm.tenantId ||
                !createForm.email.trim() ||
                !createForm.password ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update details. Leave password blank to keep the current password.
              {editUser?.role === "super_admin" ? " Platform admin: role cannot be changed here." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            {editUser?.role !== "super_admin" && (
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, role: v as (typeof TENANT_ROLES)[number] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>New password (optional)</Label>
              <Input
                type="password"
                placeholder="Leave blank to keep current"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-active"
                checked={editForm.isActive}
                onCheckedChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editUser &&
                updateMutation.mutate({
                  id: editUser.id,
                  data: editForm,
                  includeRole: editUser.role !== "super_admin",
                })
              }
              disabled={!editForm.email.trim() || !editForm.name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
