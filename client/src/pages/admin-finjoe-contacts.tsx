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
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FinJoeContact, Campus } from "@shared/schema";

const ROLES = ["campus_coordinator", "head_office", "finance", "admin", "vendor", "faculty", "student", "guest"] as const;

export default function AdminFinJoeContacts({ tenantId }: { tenantId?: string | null }) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; contact?: FinJoeContact } | null>(null);
  const [form, setForm] = useState({
    phone: "",
    role: "guest" as (typeof ROLES)[number],
    name: "",
    campusId: "",
    studentId: "",
    isActive: true,
  });
  const [deleteDialog, setDeleteDialog] = useState<FinJoeContact | null>(null);

  const qs = tenantId ? `?tenantId=${tenantId}` : "";
  const { data: contacts = [], isLoading } = useQuery<FinJoeContact[]>({
    queryKey: ["/api/admin/finjoe/contacts", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/contacts${qs}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ["/api/campuses", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/campuses${qs}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ["/api/admin/users", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users${qs}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/finjoe/contacts", {
        ...(tenantId && { tenantId }),
        phone: data.phone,
        role: data.role,
        name: data.name || undefined,
        campusId: data.campusId || undefined,
        studentId: data.studentId || undefined,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finjoe/contacts"] });
      toast({ title: "Contact added" });
      setDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof form> }) => {
      const res = await apiRequest("PATCH", `/api/admin/finjoe/contacts/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finjoe/contacts"] });
      toast({ title: "Contact updated" });
      setDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/finjoe/contacts/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finjoe/contacts"] });
      toast({ title: "Contact deleted" });
      setDeleteDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setForm({
      phone: "",
      role: "guest",
      name: "",
      campusId: "",
      studentId: "",
      isActive: true,
    });
    setDialog({ mode: "add" });
  };

  const openEdit = (c: FinJoeContact) => {
    setForm({
      phone: c.phone,
      role: c.role as (typeof ROLES)[number],
      name: c.name || "",
      campusId: c.campusId || "",
      studentId: c.studentId || "",
      isActive: c.isActive,
    });
    setDialog({ mode: "edit", contact: c });
  };

  const handleSubmit = () => {
    if (dialog?.mode === "add") {
      createMutation.mutate(form);
    } else if (dialog?.contact) {
      const studentIdValue =
        form.studentId === "clear" ? null : (form.studentId || undefined);
      updateMutation.mutate({
        id: dialog.contact.id,
        data: {
          role: form.role,
          name: form.name,
          campusId: form.campusId || undefined,
          studentId: studentIdValue,
          isActive: form.isActive,
        } as Parameters<typeof updateMutation.mutate>[0] extends { data: infer D } ? D : never,
      });
    }
  };

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a tenant to manage contacts.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              FinJoe Contacts
            </CardTitle>
          </div>
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : contacts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No contacts yet. Add your first WhatsApp contact to get started.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-4">Phone</TableHead>
                  <TableHead className="px-6 py-4">Name</TableHead>
                  <TableHead className="px-6 py-4">Role</TableHead>
                  <TableHead className="px-6 py-4">Campus</TableHead>
                  <TableHead className="px-6 py-4">Linked user</TableHead>
                  <TableHead className="px-6 py-4">Status</TableHead>
                  <TableHead className="w-[100px] px-6 py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-6 py-4">+{c.phone}</TableCell>
                    <TableCell className="px-6 py-4">{c.name || "-"}</TableCell>
                    <TableCell className="px-6 py-4">
                      <span className="capitalize">{c.role}</span>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {campuses.find((x) => x.id === c.campusId)?.name || "-"}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {c.studentId
                        ? (() => {
                            const u = users.find((x) => x.id === c.studentId);
                            return u ? `${u.name} (${u.email})` : c.studentId;
                          })()
                        : "-"}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {c.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteDialog(c)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "add" ? "Add Contact" : "Edit Contact"}</DialogTitle>
            <DialogDescription>
              {dialog?.mode === "add"
                ? "Add a phone number and role. They'll be able to use Finance Joe on WhatsApp."
                : "Update contact details."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {dialog?.mode === "add" && (
              <div className="grid gap-2">
                <Label>Phone</Label>
                <Input
                  placeholder="9876543210"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as (typeof ROLES)[number] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Name (optional)</Label>
              <Input
                placeholder="John Doe"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Campus (optional)</Label>
              <Select
                value={form.campusId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, campusId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select campus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.role === "campus_coordinator" && (
              <p className="text-sm text-muted-foreground">
                Campus coordinators are scoped to a campus. Select the campus they manage.
              </p>
            )}
            {(form.role === "admin" || form.role === "finance") && (
              <div className="grid gap-2">
                <Label>Link to existing user (optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Admin/finance contacts need a linked user to approve expenses via WhatsApp. Link to existing user or leave blank to create one automatically.
                </p>
                <Select
                  value={form.studentId || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, studentId: v === "none" ? "" : v === "clear" ? "clear" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user (or leave blank to auto-create)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (auto-create on save)</SelectItem>
                    {dialog?.mode === "edit" && dialog?.contact?.studentId && (
                      <SelectItem value="clear">Clear link</SelectItem>
                    )}
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dialog?.mode === "edit" && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <Label>Active</Label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                (dialog?.mode === "add" && !form.phone.trim()) ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {dialog?.mode === "add" ? "Add" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Remove +{deleteDialog?.phone}? They will no longer be able to use FinJoe via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
