import { useState } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Mail, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { FINJOE_PATHS, finjoePathWithTenant } from "@/lib/finjoe-routes";

const ROLES = ["admin", "finance", "campus_coordinator", "head_office"] as const;

type TenantUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  costCenterId: string | null;
  createdAt: string;
  invitePending?: boolean;
};

export default function AdminTeam({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<TenantUserRow | null>(null);
  const [createForm, setCreateForm] = useState({
    email: "",
    name: "",
    role: "finance" as (typeof ROLES)[number],
    password: "",
    sendInvite: true,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "finance" as string,
    isActive: true,
    password: "",
  });

  const qs = isSuperAdmin && tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const { data: rows = [], isLoading } = useQuery<TenantUserRow[]>({
    queryKey: ["/api/admin/tenant-users", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenant-users${qs}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load team");
      }
      return res.json();
    },
    enabled: !isSuperAdmin || !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        email: createForm.email.trim(),
        name: createForm.name.trim(),
        role: createForm.role,
        sendInvite: createForm.sendInvite,
      };
      if (isSuperAdmin && tenantId) body.tenantId = tenantId;
      if (!createForm.sendInvite) {
        if (!createForm.password || createForm.password.length < 8) {
          throw new Error("Password must be at least 8 characters when not sending invite");
        }
        body.password = createForm.password;
      }
      const res = await apiRequest("POST", "/api/admin/tenant-users", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User created",
        description: data.inviteSent ? "Invitation email sent (if mail is configured)." : "They can log in with the password you set.",
      });
      setCreateOpen(false);
      setCreateForm({ email: "", name: "", role: "finance", password: "", sendInvite: true });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editRow) return;
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        isActive: editForm.isActive,
      };
      if (isSuperAdmin && tenantId) body.tenantId = tenantId;
      if (editForm.password.trim()) body.password = editForm.password;
      const res = await apiRequest("PATCH", `/api/admin/tenant-users/${editRow.id}`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenant-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      setEditRow(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const body = isSuperAdmin && tenantId ? { tenantId } : {};
      const res = await apiRequest("POST", `/api/admin/tenant-users/${id}/send-invite`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenant-users"] });
      toast({
        title: "Invite sent",
        description: data.emailSent ? "Check the user's inbox." : "Email may not be configured — copy link from logs or set password manually.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (r: TenantUserRow) => {
    setEditRow(r);
    setEditForm({
      name: r.name,
      email: r.email,
      role: r.role,
      isActive: r.isActive,
      password: "",
    });
  };

  const addUserButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <UserPlus className="h-4 w-4 mr-2" />
      Add user
    </Button>
  );

  if (isSuperAdmin && !tenantId) {
    return (
      <div className="space-y-6">
        {!embedded && (
          <PageHeader title="Team" description="Select a tenant from the header to manage dashboard users." />
        )}
        {embedded && (
          <h2 className="text-lg font-semibold">Dashboard users</h2>
        )}
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Choose a tenant using the tenant selector above, then return to Dashboard users.
          </CardContent>
        </Card>
      </div>
    );
  }

  const contactsHref = finjoePathWithTenant(FINJOE_PATHS.peopleContacts, tenantId, isSuperAdmin);

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Dashboard users</h2>
            <p className="text-sm text-muted-foreground">
              Logins for your organization. Link them to WhatsApp contacts from{" "}
              <Link href={contactsHref} className="font-medium text-primary underline-offset-4 hover:underline">
                Contacts
              </Link>
              .
            </p>
          </div>
          {addUserButton}
        </div>
      ) : (
        <PageHeader
          title="Team"
          description={
            <span>
              Dashboard users for your organization. Link them to WhatsApp contacts from{" "}
              <Link href={contactsHref} className="font-medium text-primary underline-offset-4 hover:underline">
                FinJoe → Contacts
              </Link>
              .
            </span>
          }
          actions={addUserButton}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No users yet. Add finance or coordinators here.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.role}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {r.invitePending && (
                          <Badge variant="outline" className="ml-2">
                            Invite pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => inviteMutation.mutate(r.id)}
                            disabled={inviteMutation.isPending}
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            Resend invite
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

      <ApprovalScopesSection tenantId={tenantId} qs={qs} users={rows} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add dashboard user</DialogTitle>
            <DialogDescription>Create a user with a real email. They can set a password via invite or you can set one now.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
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
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v as (typeof ROLES)[number] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="send-invite"
                checked={createForm.sendInvite}
                onCheckedChange={(v) => setCreateForm((f) => ({ ...f, sendInvite: v }))}
              />
              <Label htmlFor="send-invite">Send email invite (set password link)</Label>
            </div>
            {!createForm.sendInvite && (
              <div className="grid gap-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !createForm.email.trim() || !createForm.name.trim()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={() => setEditRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update role, email, or set a new password (optional).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-active"
                checked={editForm.isActive}
                onCheckedChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
            <div className="grid gap-2">
              <Label>New password (optional)</Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Leave blank to keep current"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ScopeRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  scopeType: string;
  scopeValueId: string | null;
  scopeValueName: string | null;
  maxAmount: number | null;
  isActive: boolean;
};

function ApprovalScopesSection({
  tenantId,
  qs,
  users,
}: {
  tenantId: string | null;
  qs: string;
  users: TenantUserRow[];
}) {
  const { toast } = useToast();
  const { isTenantAdmin } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    userId: "",
    scopeType: "global" as string,
    scopeValueId: "",
    maxAmount: "",
  });

  const { data: scopes = [], isLoading } = useQuery<ScopeRow[]>({
    queryKey: ["/api/admin/approval-scopes", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/approval-scopes${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!tenantId && isTenantAdmin,
  });

  const { data: costCenters = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/admin/cost-centers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cost-centers${qs}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && addOpen,
  });

  const { data: categories = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/admin/expense-categories", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/expense-categories${qs}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && addOpen,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        userId: addForm.userId,
        scopeType: addForm.scopeType,
      };
      if (tenantId) body.tenantId = tenantId;
      if (addForm.scopeType !== "global" && addForm.scopeValueId) {
        body.scopeValueId = addForm.scopeValueId;
      }
      if (addForm.maxAmount) body.maxAmount = Math.round(parseFloat(addForm.maxAmount) * 100);
      const res = await apiRequest("POST", "/api/admin/approval-scopes", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/approval-scopes"] });
      toast({ title: "Approval scope added" });
      setAddOpen(false);
      setAddForm({ userId: "", scopeType: "global", scopeValueId: "", maxAmount: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/approval-scopes/${id}${qs}`);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/approval-scopes"] });
      toast({ title: "Scope removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!isTenantAdmin) return null;

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Approval authority</CardTitle>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add scope
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : scopes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No approval scopes configured. By default, all admin and finance users can approve any expense.
              Add scopes to restrict who can approve by cost center, category, or amount.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Max amount</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopes.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{s.userName}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{s.userRole}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {s.scopeType === "global"
                            ? "All expenses"
                            : `${s.scopeType.replace(/_/g, " ")}: ${s.scopeValueName || s.scopeValueId || "—"}`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.maxAmount != null
                          ? `₹${(s.maxAmount / 100).toLocaleString("en-IN")}`
                          : "Unlimited"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(s.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add approval scope</DialogTitle>
            <DialogDescription>
              Define what a user is authorized to approve.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>User</Label>
              <Select value={addForm.userId} onValueChange={(v) => setAddForm((f) => ({ ...f, userId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter((u) => u.isActive).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Scope type</Label>
              <Select value={addForm.scopeType} onValueChange={(v) => setAddForm((f) => ({ ...f, scopeType: v, scopeValueId: "" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (all expenses)</SelectItem>
                  <SelectItem value="cost_center">Cost center</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addForm.scopeType === "cost_center" && (
              <div className="grid gap-2">
                <Label>Cost center</Label>
                <Select value={addForm.scopeValueId} onValueChange={(v) => setAddForm((f) => ({ ...f, scopeValueId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cost center" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {addForm.scopeType === "category" && (
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={addForm.scopeValueId} onValueChange={(v) => setAddForm((f) => ({ ...f, scopeValueId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Max amount (optional, in ₹)</Label>
              <Input
                type="number"
                placeholder="Unlimited"
                value={addForm.maxAmount}
                onChange={(e) => setAddForm((f) => ({ ...f, maxAmount: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!addForm.userId || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
