import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Search, Plus, Edit, Trash2, IndianRupee } from "lucide-react";
import type { FeeConfiguration, Program, Campus } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminFeeConfigurations() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; config: FeeConfiguration | null }>({ open: false, config: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; config: FeeConfiguration | null }>({ open: false, config: null });
  const { toast } = useToast();

  const { data: configs, isLoading } = useQuery<FeeConfiguration[]>({
    queryKey: ["/api/admin/fee-configurations"],
  });

  const { data: programs } = useQuery<Program[]>({
    queryKey: ["/api/programs"],
  });

  const { data: campuses } = useQuery<Campus[]>({
    queryKey: ["/api/campuses"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/fee-configurations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-configurations"] });
      setDialog({ open: false, config: null });
      toast({ title: "Fee configuration created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/fee-configurations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-configurations"] });
      setDialog({ open: false, config: null });
      toast({ title: "Fee configuration updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/fee-configurations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-configurations"] });
      setDeleteDialog({ open: false, config: null });
      toast({ title: "Fee configuration deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const registrationFee = parseInt(formData.get("registrationFee") as string);
    const programFee = parseInt(formData.get("programFee") as string);
    
    const data = {
      programId: formData.get("programId") as string,
      campusId: formData.get("campusId") as string,
      registrationFee,
      programFee,
      totalFee: registrationFee + programFee,
    };

    if (dialog.config) {
      updateMutation.mutate({ id: dialog.config.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getProgramName = (programId: string) => {
    return programs?.find(p => p.id === programId)?.name || programId;
  };

  const getCampusName = (campusId: string) => {
    return campuses?.find(c => c.id === campusId)?.name || campusId;
  };

  const filteredConfigs = configs?.filter(c => {
    const programName = getProgramName(c.programId);
    const campusName = getCampusName(c.campusId);
    return (
      programName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campusName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Fee Configurations</h1>
          <p className="text-muted-foreground">Manage program fees across different campuses</p>
        </div>
        <Button onClick={() => setDialog({ open: true, config: null })} data-testid="button-create-config">
          <Plus className="w-4 h-4 mr-2" />
          Add Fee Configuration
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Fee Configurations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by program or campus..."
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
                  <TableHead>Program</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Registration Fee</TableHead>
                  <TableHead>Program Fee</TableHead>
                  <TableHead>Total Fee</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConfigs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No fee configurations found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConfigs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{getProgramName(config.programId)}</TableCell>
                      <TableCell>{getCampusName(config.campusId)}</TableCell>
                      <TableCell>₹{config.registrationFee.toLocaleString()}</TableCell>
                      <TableCell>₹{config.programFee.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-semibold">
                          <IndianRupee className="w-3 h-3 mr-1" />
                          {config.totalFee.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDialog({ open: true, config })}
                            data-testid={`button-edit-${config.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteDialog({ open: true, config })}
                            data-testid={`button-delete-${config.id}`}
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

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open, config: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.config ? "Edit Fee Configuration" : "Create Fee Configuration"}</DialogTitle>
            <DialogDescription>
              {dialog.config ? "Update fee configuration details" : "Add a new fee configuration"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="programId">Program</Label>
                <Select name="programId" defaultValue={dialog.config?.programId || ""} required>
                  <SelectTrigger data-testid="select-programId">
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
              <div className="space-y-2">
                <Label htmlFor="campusId">Campus</Label>
                <Select name="campusId" defaultValue={dialog.config?.campusId || ""} required>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="registrationFee">Registration Fee (₹)</Label>
                <Input
                  id="registrationFee"
                  name="registrationFee"
                  type="number"
                  defaultValue={dialog.config?.registrationFee || 0}
                  required
                  data-testid="input-registrationFee"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="programFee">Program Fee (₹)</Label>
                <Input
                  id="programFee"
                  name="programFee"
                  type="number"
                  defaultValue={dialog.config?.programFee || 0}
                  required
                  data-testid="input-programFee"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, config: null })}
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

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open, config: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Fee Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this fee configuration for{" "}
              <strong>{deleteDialog.config && getProgramName(deleteDialog.config.programId)}</strong> at{" "}
              <strong>{deleteDialog.config && getCampusName(deleteDialog.config.campusId)}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, config: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.config && deleteMutation.mutate(deleteDialog.config.id)}
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
