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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

type RoleRequest = {
  id: string;
  contactPhone: string;
  requestedRole: string;
  name: string | null;
  status: string;
  campusId: string | null;
  createdAt: string;
  campusName: string | null;
};

export default function AdminFinJoeRoleRequests() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rejectDialog, setRejectDialog] = useState<{ request: RoleRequest; reason: string } | null>(null);

  const { data: requests = [], isLoading } = useQuery<RoleRequest[]>({
    queryKey: ["/api/admin/finjoe/role-requests", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/role-requests?status=${statusFilter}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/finjoe/role-requests/${id}/approve`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to approve");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finjoe/role-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finjoe/contacts"] });
      toast({ title: "Role request approved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/finjoe/role-requests/${id}/reject`, { reason });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to reject");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finjoe/role-requests"] });
      toast({ title: "Role request rejected" });
      setRejectDialog(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Role Change Requests
          </CardTitle>
          <CardDescription>
            Approve or reject requests from people who want to join your organization via Finance Joe on WhatsApp.
          </CardDescription>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No role requests found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Requested Role</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>+{r.contactPhone}</TableCell>
                  <TableCell>{r.name || "-"}</TableCell>
                  <TableCell>
                    <span className="capitalize">{r.requestedRole.replace(/_/g, " ")}</span>
                  </TableCell>
                  <TableCell>{r.campusName || "-"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        r.status === "approved"
                          ? "text-green-600"
                          : r.status === "rejected"
                            ? "text-muted-foreground"
                            : "text-amber-600"
                      }
                    >
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell>{format(new Date(r.createdAt), "dd MMM yyyy, HH:mm")}</TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => approveMutation.mutate(r.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRejectDialog({ request: r, reason: "" })}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Role Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this request. The user will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g. Missing documentation"
                value={rejectDialog?.reason ?? ""}
                onChange={(e) =>
                  setRejectDialog((d) => (d ? { ...d, reason: e.target.value } : null))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectDialog &&
                rejectMutation.mutate({
                  id: rejectDialog.request.id,
                  reason: rejectDialog.reason || "Rejected via admin",
                })
              }
              disabled={rejectMutation.isPending}
            >
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
