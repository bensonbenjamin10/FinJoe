import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, Edit, Trash2, TrendingUp } from "lucide-react";
import type { YearlyStat } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminYearlyStats() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; stat: YearlyStat | null }>({ open: false, stat: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; stat: YearlyStat | null }>({ open: false, stat: null });
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<YearlyStat[]>({
    queryKey: ["/api/admin/yearly-stats"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/yearly-stats", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/yearly-stats"] });
      setDialog({ open: false, stat: null });
      toast({ title: "Yearly stat created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/yearly-stats/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/yearly-stats"] });
      setDialog({ open: false, stat: null });
      toast({ title: "Yearly stat updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/yearly-stats/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/yearly-stats"] });
      setDeleteDialog({ open: false, stat: null });
      toast({ title: "Yearly stat deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      year: formData.get("year") as string,
      totalStudents: parseInt(formData.get("totalStudents") as string) || 0,
      topRanks: parseInt(formData.get("topRanks") as string),
      top1000: parseInt(formData.get("top1000") as string),
      successRate: formData.get("successRate") as string,
    };

    if (dialog.stat) {
      updateMutation.mutate({ id: dialog.stat.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredStats = stats?.filter(s =>
    s.year.toString().includes(searchQuery)
  ) || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Yearly Statistics</h1>
          <p className="text-muted-foreground">Manage annual performance metrics</p>
        </div>
        <Button onClick={() => setDialog({ open: true, stat: null })} data-testid="button-create-stat">
          <Plus className="w-4 h-4 mr-2" />
          Add Yearly Stat
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Yearly Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by year..."
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
                  <TableHead>Year</TableHead>
                  <TableHead>Total Students</TableHead>
                  <TableHead>Top Ranks</TableHead>
                  <TableHead>Top 1000</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No statistics found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((stat) => (
                    <TableRow key={stat.id}>
                      <TableCell className="font-bold">{stat.year}</TableCell>
                      <TableCell>{stat.totalStudents?.toLocaleString() || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          {stat.topRanks}
                        </Badge>
                      </TableCell>
                      <TableCell>{stat.top1000}</TableCell>
                      <TableCell>{stat.successRate}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDialog({ open: true, stat })}
                            data-testid={`button-edit-${stat.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteDialog({ open: true, stat })}
                            data-testid={`button-delete-${stat.id}`}
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

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open, stat: null })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.stat ? "Edit Yearly Stat" : "Create Yearly Stat"}</DialogTitle>
            <DialogDescription>
              {dialog.stat ? "Update yearly statistics" : "Add statistics for a new year"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  name="year"
                  defaultValue={dialog.stat?.year || new Date().getFullYear().toString()}
                  required
                  placeholder="e.g., 2024"
                  data-testid="input-year"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalStudents">Total Students</Label>
                <Input
                  id="totalStudents"
                  name="totalStudents"
                  type="number"
                  defaultValue={dialog.stat?.totalStudents || 0}
                  data-testid="input-totalStudents"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="topRanks">Top Ranks (Top 100)</Label>
                <Input
                  id="topRanks"
                  name="topRanks"
                  type="number"
                  defaultValue={dialog.stat?.topRanks || 0}
                  required
                  data-testid="input-topRanks"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="top1000">Top 1000 Ranks</Label>
                <Input
                  id="top1000"
                  name="top1000"
                  type="number"
                  defaultValue={dialog.stat?.top1000 || 0}
                  required
                  data-testid="input-top1000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="successRate">Success Rate</Label>
              <Input
                id="successRate"
                name="successRate"
                defaultValue={dialog.stat?.successRate || ""}
                required
                placeholder="e.g., 95%, 9 out of 10"
                data-testid="input-successRate"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog({ open: false, stat: null })}
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

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open, stat: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Yearly Stat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete statistics for <strong>{deleteDialog.stat?.year}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, stat: null })}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.stat && deleteMutation.mutate(deleteDialog.stat.id)}
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
