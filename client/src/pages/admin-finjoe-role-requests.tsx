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

export default function AdminFinJoeRoleRequests({ tenantId }: { tenantId?: string | null }) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rejectDialog, setRejectDialog] = useState<{ request: RoleRequest; reason: string } | null>(null);

  const qs = new URLSearchParams({ status: statusFilter });
  if (tenantId) qs.set("tenantId", tenantId);
  const { data: requests = [], isLoading } = useQuery<RoleRequest[]>({
    queryKey: ["/api/admin/finjoe/role-requests", statusFilter, tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finjoe/role-requests?${qs}`);
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

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a tenant to view role requests.
        </CardContent>
      </Card>
    );
  }

  const filterOptions = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Role Change Requests
          </CardTitle>
          <CardDescription>
            Approve or reject requests from people who want to join your organization via Finance Joe on WhatsApp.
          </CardDescription>
        </div>
        <div className="flex overflow-x-auto gap-2 pb-2 sm:pb-0 sm:overflow-visible shrink-0">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            {statusFilter === "pending" ? "No pending requests." : "No role requests found."}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
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
                          className="min-h-[44px] min-w-[44px]"
                          onClick={() => approveMutation.mutate(r.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px]"
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
          </div>
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
