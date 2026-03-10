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
import { Search, Plus, Edit, Trash2, Calendar } from "lucide-react";
import type { Batch, Campus, Program } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminBatches() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; batch: Batch | null }>({ open: false, batch: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; batch: Batch | null }>({ open: false, batch: null });
  const { toast } = useToast();

  const { data: batches, isLoading } = useQuery<Batch[]>({
    queryKey: ["/api/admin/batches"],
  });

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const { data: programs } = useQuery<Program[]>({
    queryKey: ["/api/admin/programs"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/batches", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/batches"] });
      setDialog({ open: false, batch: null });
      toast({ title: "Batch created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/batches/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/batches"] });
      setDialog({ open: false, batch: null });
      toast({ title: "Batch updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/batches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/batches"] });
      setDeleteDialog({ open: false, batch: null });
      toast({ title: "Batch deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      name: formData.get("name") as string,
      startDate: formData.get("startDate") as string,
      campusId: formData.get("campusId") as string,
      programId: formData.get("programId") as string,
      isActive: true,
    };

    if (dialog.batch) {
      updateMutation.mutate({ id: dialog.batch.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getCampusName = (campusId: string) => {
    return campuses?.find(c => c.id === campusId)?.name || campusId;
  };

  const getProgramName = (programId: string) => {
    return programs?.find(p => p.id === programId)?.name || programId;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const filteredBatches = batches?.filter(batch =>
    batch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCampusName(batch.campusId).toLowerCase().includes(searchQuery.toLowerCase()) ||
    getProgramName(batch.programId).toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Batches</h1>
          <p className="text-muted-foreground">Manage program batches for each campus</p>
        </div>
        <Button onClick={() => setDialog({ open: true, batch: null })} data-testid="button-create-batch">
          <Plus className="w-4 h-4 mr-2" />
          Add Batch
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, campus, or program..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-batches"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading batches...</div>
          ) : filteredBatches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No batches found. Create your first batch to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {batch.name}
                      </div>
                    </TableCell>
                    <TableCell>{getCampusName(batch.campusId)}</TableCell>
                    <TableCell>{getProgramName(batch.programId)}</TableCell>
                    <TableCell>{formatDate(batch.startDate)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDialog({ open: true, batch })}
                          data-testid={`button-edit-batch-${batch.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteDialog({ open: true, batch })}
                          data-testid={`button-delete-batch-${batch.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, batch: null })}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.batch ? "Edit Batch" : "Create Batch"}</DialogTitle>
            <DialogDescription>
              {dialog.batch ? "Update batch details below." : "Fill in the details for the new batch."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Batch Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., February 2026 Batch"
                defaultValue={dialog.batch?.name || ""}
                required
                data-testid="input-batch-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={dialog.batch?.startDate || ""}
                required
                data-testid="input-batch-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="campusId">Campus</Label>
              <Select name="campusId" defaultValue={dialog.batch?.campusId || ""} required>
                <SelectTrigger data-testid="select-batch-campus">
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
              <Label htmlFor="programId">Program</Label>
              <Select name="programId" defaultValue={dialog.batch?.programId || ""} required>
                <SelectTrigger data-testid="select-batch-program">
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {programs?.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, batch: null })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-batch"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : dialog.batch
                  ? "Update Batch"
                  : "Create Batch"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, batch: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Batch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.batch?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, batch: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.batch && deleteMutation.mutate(deleteDialog.batch.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-batch"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
