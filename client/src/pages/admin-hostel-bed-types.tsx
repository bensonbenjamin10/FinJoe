import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, Home } from "lucide-react";
import type { HostelBedType, Campus } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminHostelBedTypes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; bedType: HostelBedType | null }>({ open: false, bedType: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; bedType: HostelBedType | null }>({ open: false, bedType: null });
  const { toast } = useToast();

  const { data: bedTypes, isLoading } = useQuery<HostelBedType[]>({
    queryKey: ["/api/admin/hostel-bed-types"],
  });

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/hostel-bed-types", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hostel-bed-types"] });
      setDialog({ open: false, bedType: null });
      toast({ title: "Hostel bed type created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/hostel-bed-types/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hostel-bed-types"] });
      setDialog({ open: false, bedType: null });
      toast({ title: "Hostel bed type updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/hostel-bed-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hostel-bed-types"] });
      setDeleteDialog({ open: false, bedType: null });
      toast({ title: "Hostel bed type deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      campusId: formData.get("campusId") as string,
      bedType: formData.get("bedType") as string,
      monthlyFee: parseInt(formData.get("monthlyFee") as string),
      totalBeds: parseInt(formData.get("totalBeds") as string),
      availableBeds: parseInt(formData.get("availableBeds") as string),
    };

    if (dialog.bedType) {
      updateMutation.mutate({ id: dialog.bedType.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getCampusName = (campusId: string) => {
    return campuses?.find(c => c.id === campusId)?.name || campusId;
  };

  const filteredBedTypes = bedTypes?.filter(bt =>
    bt.bedType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCampusName(bt.campusId).toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Hostel Bed Types</h1>
          <p className="text-muted-foreground">Manage hostel accommodation options and pricing</p>
        </div>
        <Button onClick={() => setDialog({ open: true, bedType: null })} data-testid="button-create-bedtype">
          <Plus className="w-4 h-4 mr-2" />
          Add Bed Type
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Hostel Bed Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bed types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus</TableHead>
                  <TableHead>Bed Type</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Total Beds</TableHead>
                  <TableHead>Available Beds</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBedTypes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hostel bed types found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBedTypes.map((bedType) => (
                    <TableRow key={bedType.id}>
                      <TableCell className="font-medium">{getCampusName(bedType.campusId)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4" />
                          {bedType.bedType}
                        </div>
                      </TableCell>
                      <TableCell className="text-green-600 font-semibold">
                        ₹{bedType.monthlyFee.toLocaleString()}/month
                      </TableCell>
                      <TableCell>{bedType.totalBeds}</TableCell>
                      <TableCell>{bedType.availableBeds}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDialog({ open: true, bedType })}
                            data-testid={`button-edit-${bedType.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteDialog({ open: true, bedType })}
                            data-testid={`button-delete-${bedType.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open, bedType: null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialog.bedType ? "Edit Hostel Bed Type" : "Create Hostel Bed Type"}</DialogTitle>
            <DialogDescription>
              {dialog.bedType ? "Update hostel bed type details" : "Add a new hostel bed type"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="campusId">Campus</Label>
                <Select name="campusId" defaultValue={dialog.bedType?.campusId || ""} required>
                  <SelectTrigger data-testid="select-campusId">
                    <SelectValue placeholder="Select campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses?.map((campus) => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bedType">Bed Type</Label>
                <Select name="bedType" defaultValue={dialog.bedType?.bedType || ""} required>
                  <SelectTrigger data-testid="select-bedType">
                    <SelectValue placeholder="Select bed type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="twin">Twin</SelectItem>
                    <SelectItem value="triple">Triple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyFee">Monthly Fee (₹)</Label>
                <Input
                  id="monthlyFee"
                  name="monthlyFee"
                  type="number"
                  defaultValue={dialog.bedType?.monthlyFee || 0}
                  required
                  data-testid="input-monthlyFee"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalBeds">Total Beds</Label>
                <Input
                  id="totalBeds"
                  name="totalBeds"
                  type="number"
                  defaultValue={dialog.bedType?.totalBeds || 0}
                  required
                  data-testid="input-totalBeds"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availableBeds">Available Beds</Label>
                <Input
                  id="availableBeds"
                  name="availableBeds"
                  type="number"
                  defaultValue={dialog.bedType?.availableBeds || 0}
                  required
                  data-testid="input-availableBeds"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, bedType: null })}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open, bedType: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Hostel Bed Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteDialog.bedType?.bedType}</strong> hostel bed type at {deleteDialog.bedType && getCampusName(deleteDialog.bedType.campusId)}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, bedType: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.bedType && deleteMutation.mutate(deleteDialog.bedType.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
