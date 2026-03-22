import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Loader2, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CostCenter } from "@shared/schema";

export default function AdminCostCenters({
  tenantId,
  costCenterLabel: costCenterLabelProp,
}: {
  tenantId?: string | null;
  costCenterLabel?: string;
}) {
  const { toast } = useToast();
  const [addDialog, setAddDialog] = useState(false);

  const { data: settings } = useQuery<{ costCenterLabel?: string | null }>({
    queryKey: ["/api/admin/finjoe/settings", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/settings${tenantId ? `?tenantId=${tenantId}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId && costCenterLabelProp === undefined,
  });
  const costCenterLabel = costCenterLabelProp ?? settings?.costCenterLabel ?? "Cost Center";
  const plural = (s: string) => {
    if (s === "Branch") return "Branches";
    if (s === "Campus") return "Campuses";
    if (s === "Department") return "Departments";
    return s.endsWith("s") ? s : `${s}s`;
  };
  const costCenterLabelPlural = plural(costCenterLabel);
  const [editDialog, setEditDialog] = useState<CostCenter | null>(null);
  const [addForm, setAddForm] = useState({ name: "", slug: "", type: "", billingGstin: "", billingStateCode: "" });
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    type: "",
    isActive: true,
    billingGstin: "",
    billingStateCode: "",
  });

  const qs = tenantId ? `?tenantId=${tenantId}` : "";
  const { data: costCenters = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ["/api/admin/cost-centers", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/cost-centers${qs}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      slug?: string;
      type?: string;
      billingGstin?: string;
      billingStateCode?: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/cost-centers", {
        ...(tenantId && { tenantId }),
        name: data.name,
        slug: data.slug || undefined,
        type: data.type || undefined,
        ...(data.billingGstin !== undefined && { billingGstin: data.billingGstin || null }),
        ...(data.billingStateCode !== undefined && { billingStateCode: data.billingStateCode || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campuses"] });
      toast({ title: `${costCenterLabel} created` });
      setAddDialog(false);
      setAddForm({ name: "", slug: "", type: "", billingGstin: "", billingStateCode: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<typeof editForm> & { billingGstin?: string | null; billingStateCode?: string | null };
    }) => {
      const body: Record<string, unknown> = { ...(tenantId && { tenantId }) };
      if (data.name !== undefined) body.name = data.name;
      if (data.slug !== undefined) body.slug = data.slug;
      if (data.type !== undefined) body.type = data.type;
      if (data.isActive !== undefined) body.isActive = data.isActive;
      if (data.billingGstin !== undefined) body.billingGstin = data.billingGstin;
      if (data.billingStateCode !== undefined) body.billingStateCode = data.billingStateCode;
      const res = await apiRequest("PATCH", `/api/admin/cost-centers/${id}`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campuses"] });
      toast({ title: `${costCenterLabel} updated` });
      setEditDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = `/api/admin/cost-centers/${id}${tenantId ? `?tenantId=${tenantId}` : ""}`;
      const res = await apiRequest("DELETE", url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to deactivate");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campuses"] });
      toast({ title: `${costCenterLabel} deactivated` });
      setEditDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setAddForm({ name: "", slug: "", type: "", billingGstin: "", billingStateCode: "" });
    setAddDialog(true);
  };

  const openEdit = (cc: CostCenter) => {
    setEditForm({
      name: cc.name,
      slug: cc.slug,
      type: cc.type || "",
      isActive: cc.isActive,
      billingGstin: cc.billingGstin ?? "",
      billingStateCode: cc.billingStateCode ?? "",
    });
    setEditDialog(cc);
  };

  const handleAddSubmit = () => {
    if (!addForm.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: addForm.name.trim(),
      slug: addForm.slug.trim() || undefined,
      type: addForm.type.trim() || undefined,
      billingGstin: addForm.billingGstin.trim() || undefined,
      billingStateCode: addForm.billingStateCode.trim() || undefined,
    });
  };

  const handleEditSubmit = () => {
    if (!editDialog) return;
    if (!editForm.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editDialog.id,
      data: {
        name: editForm.name.trim(),
        slug: editForm.slug.trim() || undefined,
        type: editForm.type.trim() || undefined,
        isActive: editForm.isActive,
        billingGstin: editForm.billingGstin.trim() || null,
        billingStateCode: editForm.billingStateCode.trim() || null,
      },
    });
  };

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a tenant to manage cost centers.
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
              <Building2 className="h-5 w-5" />
              {costCenterLabelPlural}
            </CardTitle>
            <CardDescription className="text-base mt-1">
              Add and manage {costCenterLabelPlural.toLowerCase()} (e.g. branches, departments). Optional billing GSTIN per{" "}
              {costCenterLabel.toLowerCase()} for India GST invoices. Configure the label in Settings.
            </CardDescription>
          </div>
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add {costCenterLabel}
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : costCenters.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No {costCenterLabelPlural.toLowerCase()} yet. Add your first one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6 py-4">Name</TableHead>
                    <TableHead className="px-6 py-4">Slug</TableHead>
                    <TableHead className="px-6 py-4">Type</TableHead>
                    <TableHead className="px-6 py-4">Billing GSTIN</TableHead>
                    <TableHead className="px-6 py-4">Status</TableHead>
                    <TableHead className="w-[100px] px-6 py-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCenters.map((cc) => (
                    <TableRow key={cc.id}>
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{cc.name}</span>
                          {((cc as any).createdByName || (cc as any).updatedByName) && (
                            <span 
                              className="text-xs text-muted-foreground cursor-help"
                              title={`Created by: ${(cc as any).createdByName || 'Unknown'}\nUpdated by: ${(cc as any).updatedByName || 'Unknown'}`}
                            >
                              {(cc as any).updatedByName ? `Upd: ${(cc as any).updatedByName}` : `By: ${(cc as any).createdByName}`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 font-mono text-sm">{cc.slug}</TableCell>
                      <TableCell className="px-6 py-4">{cc.type || "-"}</TableCell>
                      <TableCell className="px-6 py-4 font-mono text-xs">
                        {cc.billingGstin || "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {cc.isActive ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(cc)}>
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

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {costCenterLabel}</DialogTitle>
            <DialogDescription>
              Create a new {costCenterLabel.toLowerCase()}. Slug is auto-generated from name if left blank.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Main Branch"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Slug (optional)</Label>
              <Input
                placeholder="Auto-generated from name"
                value={addForm.slug}
                onChange={(e) => setAddForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type (optional)</Label>
              <Input
                placeholder="e.g. campus, branch, department"
                value={addForm.type}
                onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Billing GSTIN (optional)</Label>
              <Input
                className="font-mono"
                placeholder="15-character GSTIN for invoices (India GST)"
                maxLength={15}
                value={addForm.billingGstin}
                onChange={(e) => setAddForm((f) => ({ ...f, billingGstin: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Billing state code (optional)</Label>
              <Input
                className="font-mono w-24"
                placeholder="27"
                maxLength={2}
                value={addForm.billingStateCode}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    billingStateCode: e.target.value.replace(/\D/g, "").slice(0, 2),
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSubmit} disabled={!addForm.name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {costCenterLabel}</DialogTitle>
            <DialogDescription>
              Update {costCenterLabel.toLowerCase()} details. Deactivating hides it from dropdowns but preserves history.
            </DialogDescription>
          </DialogHeader>
          {editDialog && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Name *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Slug</Label>
                <Input
                  value={editForm.slug}
                  onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Input
                  placeholder="e.g. campus, branch, department"
                  value={editForm.type}
                  onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-cc-active"
                  checked={editForm.isActive}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="edit-cc-active">Active</Label>
              </div>
              <div className="grid gap-2">
                <Label>Billing GSTIN (optional)</Label>
                <Input
                  className="font-mono"
                  placeholder="15-character GSTIN"
                  maxLength={15}
                  value={editForm.billingGstin}
                  onChange={(e) => setEditForm((f) => ({ ...f, billingGstin: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Billing state code (optional)</Label>
                <Input
                  className="font-mono w-24"
                  placeholder="27"
                  maxLength={2}
                  value={editForm.billingStateCode}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      billingStateCode: e.target.value.replace(/\D/g, "").slice(0, 2),
                    }))
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              Cancel
            </Button>
            {editDialog && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(editDialog.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Deactivate
                </Button>
                <Button onClick={handleEditSubmit} disabled={!editForm.name.trim() || updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
