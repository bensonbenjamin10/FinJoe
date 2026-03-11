import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Edit, Loader2, Users } from "lucide-react";
import type { Campus } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  campusId?: string | null;
  costCenterId?: string | null;
  isActive: boolean;
  createdAt: string;
};

const ROLES = [
  "student",
  "admin",
  "cashier",
  "finance",
  "cost_center_coordinator",
  "campus_coordinator",
  "head_office",
] as const;

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  cashier: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
  finance: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  cost_center_coordinator: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  campus_coordinator: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30",
  head_office: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30",
  student: "bg-slate-500/20 text-slate-700 dark:text-slate-400 border-slate-500/30",
};

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_BADGE_STYLES[role] ?? "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={style}>
      {role.replace(/_/g, " ")}
    </Badge>
  );
}

export default function AdminUsersPanel() {
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    role: "all",
    campusId: "all",
    search: "",
  });
  const [editDialog, setEditDialog] = useState<{ open: boolean; user: AdminUser | null }>({
    open: false,
    user: null,
  });
  const [editForm, setEditForm] = useState<{ role: string; campusId: string }>({
    role: "student",
    campusId: "",
  });

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: users, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users", filters.role, filters.campusId, filters.search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.role !== "all") params.set("role", filters.role);
      if (filters.campusId !== "all") params.set("campusId", filters.campusId);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const url = `/api/admin/users${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { role?: string; campusId?: string | null } }) => {
      return await apiRequest("PATCH", `/api/admin/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditDialog({ open: false, user: null });
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenEdit = (user: AdminUser) => {
    setEditDialog({ open: true, user });
    setEditForm({
      role: user.role,
      campusId: (user.costCenterId ?? user.campusId) ?? "__none__",
    });
  };

  const handleSaveEdit = () => {
    if (!editDialog.user) return;
    const { role, campusId } = editForm;
    const payload: { role: string; campusId?: string | null; costCenterId?: string | null } = { role };
    const isCoordinator = role === "cost_center_coordinator" || role === "campus_coordinator";
    if (isCoordinator) {
      if (!campusId || campusId === "__none__") {
        toast({ title: "Cost center is required for coordinator role", variant: "destructive" });
        return;
      }
      payload.campusId = campusId;
      payload.costCenterId = campusId;
    } else {
      payload.campusId = null;
      payload.costCenterId = null;
    }
    updateUserMutation.mutate({ id: editDialog.user.id, data: payload });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Users & Roles
        </CardTitle>
        <CardDescription>
          View and manage user roles and cost center assignments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>
          <Select
            value={filters.role}
            onValueChange={(v) => setFilters((f) => ({ ...f, role: v }))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.campusId}
            onValueChange={(v) => setFilters((f) => ({ ...f, campusId: v }))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by cost center" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cost centers</SelectItem>
              {campuses?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load users. Please try again.
          </div>
        ) : !users || users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No users match your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Cost Center</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell>
                      {(user.costCenterId ?? user.campusId)
                        ? campuses?.find((c) => c.id === (user.costCenterId ?? user.campusId))?.name ?? (user.costCenterId ?? user.campusId)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(user.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(user)}
                        data-testid={`button-edit-user-${user.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, user: editDialog.user })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              {editDialog.user?.name} ({editDialog.user?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Role</label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(editForm.role === "cost_center_coordinator" || editForm.role === "campus_coordinator") && (
              <div>
                <label className="text-sm font-medium mb-2 block">Cost Center *</label>
                <Select
                  value={editForm.campusId}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, campusId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select cost center" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select cost center</SelectItem>
                    {campuses?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditDialog({ open: false, user: null })}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={updateUserMutation.isPending}
                data-testid="button-save-user"
              >
                {updateUserMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
