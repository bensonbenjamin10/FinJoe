import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Plus, Gift, Users, IndianRupee, TrendingUp, Loader2, RefreshCw, Settings, ToggleLeft, UserPlus, Phone, Mail } from "lucide-react";
import type { ReferralWithDetails, ReferralCodeWithStats, ReferralConfiguration, ReferralLeadWithDetails, Campus, Program } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function AdminReferrals() {
  const [activeTab, setActiveTab] = useState("referrals");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [configDialog, setConfigDialog] = useState<{ open: boolean; config: ReferralConfiguration | null }>({
    open: false,
    config: null,
  });
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; referral: ReferralWithDetails | null }>({
    open: false,
    referral: null,
  });
  const { toast } = useToast();

  // Data queries
  const { data: referrals = [], isLoading: isLoadingReferrals } = useQuery<ReferralWithDetails[]>({
    queryKey: ["/api/admin/referrals", statusFilter !== "all" ? statusFilter : undefined],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const response = await fetch(`/api/admin/referrals${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  const { data: stats } = useQuery<{
    totalReferrals: number;
    successfulReferrals: number;
    pendingRewards: number;
    totalRewardsPaid: number;
    totalDiscountsGiven: number;
  }>({
    queryKey: ["/api/admin/referrals/stats"],
  });

  const { data: referralCodes = [], isLoading: isLoadingCodes } = useQuery<ReferralCodeWithStats[]>({
    queryKey: ["/api/admin/referral-codes"],
  });

  const { data: configs = [], isLoading: isLoadingConfigs } = useQuery<ReferralConfiguration[]>({
    queryKey: ["/api/admin/referral-configs"],
  });

  const { data: referralLeadsList = [], isLoading: isLoadingLeads } = useQuery<ReferralLeadWithDetails[]>({
    queryKey: ["/api/admin/referral-leads"],
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/referral-leads/${id}`, { status, adminNotes });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-leads"] });
      toast({ title: "Lead Updated" });
    },
  });

  const { data: campuses } = useQuery<Campus[]>({ queryKey: ["/api/campuses"] });
  const { data: programs } = useQuery<Program[]>({ queryKey: ["/api/admin/programs"] });

  // Mutations
  const bulkGenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/referral-codes/bulk-generate", {});
      if (!response.ok) throw new Error("Failed to generate");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-codes"] });
      toast({ title: "Codes Generated", description: `${data.generated} new referral codes created.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate codes", variant: "destructive" });
    },
  });

  const toggleCodeMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return await apiRequest("PATCH", `/api/admin/referral-codes/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-codes"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/referrals/${id}/status`, { status, adminNotes });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/stats"] });
      setStatusDialog({ open: false, referral: null });
      toast({ title: "Status Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const createConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/referral-configs", data);
      if (!response.ok) throw new Error("Failed to create");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-configs"] });
      setConfigDialog({ open: false, config: null });
      toast({ title: "Configuration Created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create config", variant: "destructive" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/referral-configs/${id}`, data);
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-configs"] });
      setConfigDialog({ open: false, config: null });
      toast({ title: "Configuration Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update config", variant: "destructive" });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/referral-configs/${id}`, {});
      if (!response.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-configs"] });
      toast({ title: "Configuration Deleted" });
    },
  });

  const filteredReferrals = referrals.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.refereeEmail.toLowerCase().includes(q) ||
      r.referrer?.name?.toLowerCase().includes(q) ||
      r.referralCode?.code?.toLowerCase().includes(q)
    );
  });

  const filteredCodes = referralCodes.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.student?.name?.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Gift className="w-8 h-8 text-primary" />
              Referral Program
            </h1>
            <p className="text-muted-foreground mt-1">Manage referrals, codes, and reward configurations</p>
          </div>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Referrals</span>
                </div>
                <p className="text-2xl font-bold">{stats.totalReferrals}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-muted-foreground">Successful</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{stats.successfulReferrals}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <IndianRupee className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs text-muted-foreground">Pending Rewards</span>
                </div>
                <p className="text-2xl font-bold text-yellow-600">₹{stats.pendingRewards.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <IndianRupee className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Rewards Paid</span>
                </div>
                <p className="text-2xl font-bold">₹{stats.totalRewardsPaid.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Discounts Given</span>
                </div>
                <p className="text-2xl font-bold">₹{stats.totalDiscountsGiven.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="leads">Leads ({referralLeadsList.length})</TabsTrigger>
            <TabsTrigger value="codes">Referral Codes</TabsTrigger>
            <TabsTrigger value="configs">Configurations</TabsTrigger>
          </TabsList>

          {/* Referrals Tab */}
          <TabsContent value="referrals" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, referrer, or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="payment_confirmed">Confirmed</SelectItem>
                  <SelectItem value="reward_approved">Approved</SelectItem>
                  <SelectItem value="reward_disbursed">Disbursed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoadingReferrals ? (
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filteredReferrals.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">No referrals found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Referrer</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Referee Email</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReferrals.map((referral) => (
                        <TableRow key={referral.id}>
                          <TableCell className="text-sm">
                            {format(new Date(referral.createdAt), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {referral.referrer?.name || "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {referral.referralCode?.code || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{referral.refereeEmail}</TableCell>
                          <TableCell>₹{referral.discountApplied.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-green-600 font-medium">
                            ₹{referral.referrerRewardAmount.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={referral.status === "reward_disbursed" ? "default" : "secondary"}
                              className={
                                referral.status === "reward_approved" || referral.status === "reward_disbursed"
                                  ? "bg-green-600"
                                  : referral.status === "payment_confirmed"
                                  ? "bg-blue-600"
                                  : ""
                              }
                            >
                              {referral.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setStatusDialog({ open: true, referral })}
                            >
                              Update
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referral Leads Tab */}
          <TabsContent value="leads" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                {isLoadingLeads ? (
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : referralLeadsList.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No referral leads yet. Students can submit friend details from their dashboard.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Referred By</TableHead>
                        <TableHead>Friend</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Exam</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referralLeadsList.map((lead) => (
                        <TableRow key={lead.id}>
                          <TableCell className="text-sm">
                            {format(new Date(lead.createdAt), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {lead.referrer?.name || "Unknown"}
                            {lead.referralCode && (
                              <Badge variant="outline" className="ml-2 font-mono text-xs">
                                {lead.referralCode.code}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{lead.friendName}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5 text-xs">
                              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.friendPhone}</span>
                              {lead.friendEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.friendEmail}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm capitalize">
                            {lead.examPreparing?.replace(/_/g, " ") || "-"}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={lead.status}
                              onValueChange={(status) => updateLeadMutation.mutate({ id: lead.id, status })}
                            >
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="submitted">Submitted</SelectItem>
                                <SelectItem value="contacted">Contacted</SelectItem>
                                <SelectItem value="interested">Interested</SelectItem>
                                <SelectItem value="registered">Registered</SelectItem>
                                <SelectItem value="not_interested">Not Interested</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {lead.personalMessage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title={lead.personalMessage}
                                onClick={() => toast({ title: "Personal Message", description: lead.personalMessage || "" })}
                              >
                                View Note
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referral Codes Tab */}
          <TabsContent value="codes" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code or student name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => bulkGenerateMutation.mutate()} disabled={bulkGenerateMutation.isPending}>
                {bulkGenerateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Generate for All Students
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoadingCodes ? (
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filteredCodes.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">No referral codes found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Total Referrals</TableHead>
                        <TableHead>Successful</TableHead>
                        <TableHead>Earnings</TableHead>
                        <TableHead>Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell className="font-medium">{code.student?.name || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-base">
                              {code.code}
                            </Badge>
                          </TableCell>
                          <TableCell>{code.totalReferrals}</TableCell>
                          <TableCell className="text-green-600 font-medium">{code.successfulReferrals}</TableCell>
                          <TableCell>₹{code.totalEarnings.toLocaleString("en-IN")}</TableCell>
                          <TableCell>
                            <Switch
                              checked={code.isActive}
                              onCheckedChange={(checked) =>
                                toggleCodeMutation.mutate({ id: code.id, isActive: checked })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configurations Tab */}
          <TabsContent value="configs" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setConfigDialog({ open: true, config: null })}>
                <Plus className="w-4 h-4 mr-2" />
                New Configuration
              </Button>
            </div>

            {isLoadingConfigs ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
              </div>
            ) : configs.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No referral configurations yet. Create one to enable the referral program.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {configs.map((config) => (
                  <Card key={config.id} className={!config.isActive ? "opacity-60" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{config.name}</CardTitle>
                          <Badge variant={config.isActive ? "default" : "secondary"}>
                            {config.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfigDialog({ open: true, config })}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteConfigMutation.mutate(config.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Referee Discount</p>
                          <p className="font-semibold">
                            {config.refereeDiscountType === "percentage"
                              ? `${config.refereeDiscountValue}%`
                              : `₹${config.refereeDiscountValue.toLocaleString("en-IN")}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Referrer Reward</p>
                          <p className="font-semibold text-green-600">
                            ₹{config.referrerRewardValue.toLocaleString("en-IN")} ({config.referrerRewardType})
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Valid Period</p>
                          <p className="font-semibold">
                            {format(new Date(config.validFrom), "MMM dd")} - {format(new Date(config.validTo), "MMM dd, yyyy")}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Stack with Promo</p>
                          <p className="font-semibold">{config.allowStackWithPromo ? "Yes" : "No"}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Status Update Dialog */}
      <Dialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog({ open, referral: statusDialog.referral })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Referral Status</DialogTitle>
            <DialogDescription>
              Referral for {statusDialog.referral?.refereeEmail}
            </DialogDescription>
          </DialogHeader>
          <StatusUpdateForm
            referral={statusDialog.referral}
            onSubmit={(status, adminNotes) => {
              if (statusDialog.referral) {
                updateStatusMutation.mutate({ id: statusDialog.referral.id, status, adminNotes });
              }
            }}
            isPending={updateStatusMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Configuration Dialog */}
      <Dialog open={configDialog.open} onOpenChange={(open) => setConfigDialog({ open, config: configDialog.config })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{configDialog.config ? "Edit Configuration" : "New Configuration"}</DialogTitle>
          </DialogHeader>
          <ConfigForm
            config={configDialog.config}
            onSubmit={(data) => {
              if (configDialog.config) {
                updateConfigMutation.mutate({ id: configDialog.config.id, data });
              } else {
                createConfigMutation.mutate(data);
              }
            }}
            isPending={createConfigMutation.isPending || updateConfigMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusUpdateForm({
  referral,
  onSubmit,
  isPending,
}: {
  referral: ReferralWithDetails | null;
  onSubmit: (status: string, adminNotes?: string) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState(referral?.status || "pending");
  const [adminNotes, setAdminNotes] = useState(referral?.adminNotes || "");

  if (!referral) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="payment_confirmed">Payment Confirmed</SelectItem>
            <SelectItem value="reward_approved">Reward Approved</SelectItem>
            <SelectItem value="reward_disbursed">Reward Disbursed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Admin Notes</Label>
        <Input value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Optional notes..." />
      </div>
      <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
        <p><strong>Referrer:</strong> {referral.referrer?.name || "Unknown"}</p>
        <p><strong>Reward Amount:</strong> ₹{referral.referrerRewardAmount.toLocaleString("en-IN")}</p>
        <p><strong>Discount Applied:</strong> ₹{referral.discountApplied.toLocaleString("en-IN")}</p>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(status, adminNotes)} disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Update Status
        </Button>
      </DialogFooter>
    </div>
  );
}

function ConfigForm({
  config,
  onSubmit,
  isPending,
}: {
  config: ReferralConfiguration | null;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(config?.name || "");
  const [refereeDiscountType, setRefereeDiscountType] = useState(config?.refereeDiscountType || "fixed");
  const [refereeDiscountValue, setRefereeDiscountValue] = useState(config?.refereeDiscountValue?.toString() || "");
  const [referrerRewardType, setReferrerRewardType] = useState(config?.referrerRewardType || "cash");
  const [referrerRewardValue, setReferrerRewardValue] = useState(config?.referrerRewardValue?.toString() || "");
  const [referrerRewardDescription, setReferrerRewardDescription] = useState(config?.referrerRewardDescription || "");
  const [maxDiscountCap, setMaxDiscountCap] = useState(config?.maxDiscountCap?.toString() || "");
  const [validFrom, setValidFrom] = useState(
    config?.validFrom ? format(new Date(config.validFrom), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const [validTo, setValidTo] = useState(
    config?.validTo ? format(new Date(config.validTo), "yyyy-MM-dd") : ""
  );
  const [isActive, setIsActive] = useState(config?.isActive ?? true);
  const [allowStack, setAllowStack] = useState(config?.allowStackWithPromo ?? false);

  const handleSubmit = () => {
    onSubmit({
      name,
      refereeDiscountType,
      refereeDiscountValue: parseInt(refereeDiscountValue) || 0,
      referrerRewardType,
      referrerRewardValue: parseInt(referrerRewardValue) || 0,
      referrerRewardDescription: referrerRewardDescription || undefined,
      maxDiscountCap: maxDiscountCap ? parseInt(maxDiscountCap) : undefined,
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(validTo).toISOString(),
      isActive,
      allowStackWithPromo: allowStack,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Configuration Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., 2026 Season Referral" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Referee Discount Type</Label>
          <Select value={refereeDiscountType} onValueChange={setRefereeDiscountType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed (₹)</SelectItem>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Discount Value</Label>
          <Input
            type="number"
            value={refereeDiscountValue}
            onChange={(e) => setRefereeDiscountValue(e.target.value)}
            placeholder={refereeDiscountType === "percentage" ? "e.g., 10" : "e.g., 5000"}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Referrer Reward Type</Label>
          <Select value={referrerRewardType} onValueChange={setReferrerRewardType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="gift">Gift</SelectItem>
              <SelectItem value="credit">Wallet Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Reward Value (₹)</Label>
          <Input
            type="number"
            value={referrerRewardValue}
            onChange={(e) => setReferrerRewardValue(e.target.value)}
            placeholder="e.g., 1000"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Reward Description (Optional)</Label>
        <Input
          value={referrerRewardDescription}
          onChange={(e) => setReferrerRewardDescription(e.target.value)}
          placeholder="e.g., Amazon Gift Card"
        />
      </div>

      <div className="space-y-2">
        <Label>Max Discount Cap (₹, Optional)</Label>
        <Input
          type="number"
          value={maxDiscountCap}
          onChange={(e) => setMaxDiscountCap(e.target.value)}
          placeholder="Leave empty for no cap"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Valid From</Label>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Valid To</Label>
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>Active</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={allowStack} onCheckedChange={setAllowStack} />
          <Label>Allow stacking with promo codes</Label>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={handleSubmit} disabled={isPending || !name || !refereeDiscountValue || !referrerRewardValue || !validTo}>
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {config ? "Update" : "Create"} Configuration
        </Button>
      </DialogFooter>
    </div>
  );
}
