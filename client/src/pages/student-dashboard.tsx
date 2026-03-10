import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Calendar, MapPin, Bed, User, Mail, Phone, CreditCard, AlertCircle, Loader2, Ticket, Bell, Clock, IndianRupee, Receipt, Upload, DollarSign, Gift, Copy, Share2, Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { RegistrationDetailedView, Notification, HostelPaymentPeriod, Payment, Batch, ReferralCode, Referral, ReferralWallet, ReferralWalletTransaction, ReferralWithDetails } from "@shared/schema";
import { format, formatDistanceToNow, isBefore, startOfDay } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploadField } from "@/components/ImageUploadField";

function NotificationCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const { data: notifications = [], refetch: refetchNotifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const { data: unreadCountData, refetch: refetchUnreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
  });

  const unreadCount = unreadCountData?.count ?? 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/mark-all-read", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read",
        variant: "destructive",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "payment":
        return <IndianRupee className="w-4 h-4" />;
      case "reminder":
        return <Clock className="w-4 h-4" />;
      case "announcement":
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  if (!user) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
              data-testid="badge-unread-count"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending || unreadCount === 0}
              data-testid="button-mark-all-read"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Bell className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 cursor-pointer transition-colors hover-elevate ${
                    !notification.isRead ? "bg-accent/50" : ""
                  }`}
                  data-testid={`notification-item-${notification.id}`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm line-clamp-1">
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function StudentDashboard() {
  const params = useParams();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Use registrationId from URL param or from authenticated user
  const registrationId = params.registrationId || user?.registrationId;

  const { data: registration, isLoading, error } = useQuery<RegistrationDetailedView>({
    queryKey: ["/api/registrations", registrationId],
    queryFn: async () => {
      const response = await fetch(`/api/registrations/${registrationId}`);
      if (!response.ok) {
        throw new Error("Registration not found");
      }
      return response.json();
    },
    enabled: !!registrationId,
  });

  // Fetch remaining fee calculation from API
  const { data: remainingFeeData } = useQuery<{
    registrationId: string;
    programFee: number;
    paidAmount: number;
    remainingAmount: number;
    currency: string;
  }>({
    queryKey: ["/api/registrations", registrationId, "remaining-fee"],
    queryFn: async () => {
      const response = await fetch(`/api/registrations/${registrationId}/remaining-fee`);
      if (!response.ok) {
        throw new Error("Failed to fetch remaining fee");
      }
      return response.json();
    },
    enabled: !!registrationId,
  });

  // Fetch batch information if registration has a batchId
  const { data: batch } = useQuery<Batch>({
    queryKey: ["/api/batches", registration?.batchId],
    queryFn: async () => {
      const batchId = (registration as any)?.batchId;
      if (!batchId) return null;
      // Get all batches and find the one matching the batchId
      const response = await fetch(`/api/admin/batches`);
      if (!response.ok) throw new Error("Failed to fetch batch");
      const batches = await response.json();
      return batches.find((b: Batch) => b.id === batchId) || null;
    },
    enabled: !!(registration as any)?.batchId,
  });

  const createRemainingFeePaymentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/registrations/${registrationId}/create-remaining-fee-payment`,
        {}
      );
      const data = await response.json();
      if (!data.orderId || !data.registrationId) {
        throw new Error("Invalid payment response: missing required fields");
      }
      return data;
    },
    onSuccess: (data: { orderId: string; registrationId: string }) => {
      setLocation(`/payment-checkout?orderId=${data.orderId}&registrationId=${data.registrationId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !registration) {
    return <ErrorState registrationId={registrationId} />;
  }

  const registrationFeePaid = registration.payments?.some(p => p.status === "captured") || false;
  const totalRegistrationAmount = registration.payments?.find(p => p.status === "captured")?.amount || 0;
  
  const totalProgramFee = registration.feeConfiguration?.totalFee || 0;
  // Use API calculation for remaining fee (accounts for registration fee)
  const programFeeRemaining = remainingFeeData?.remainingAmount ?? 0;
  const hostelMonthlyFee = registration.hostelBedType?.monthlyFee || 0;

  const formatBedType = (bedType: string) => {
    return bedType.charAt(0).toUpperCase() + bedType.slice(1);
  };

  const getPaymentStatusBadge = (paid: boolean, status: string) => {
    if (paid) {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid="badge-payment-paid">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Paid
        </Badge>
      );
    }
    if (status === "pending") {
      return (
        <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-700 text-white" data-testid="badge-payment-pending">
          Pending
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" data-testid="badge-payment-unknown">
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 text-center space-y-2">
              <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">
                Student Dashboard
              </h1>
              <p className="text-muted-foreground" data-testid="text-registration-id">
                Registration ID: {registration.id}
              </p>
            </div>
            {user && (
              <div className="flex-shrink-0">
                <NotificationCenter />
              </div>
            )}
          </div>
          
          {/* Quick Actions */}
          {user && (
            <div className="flex justify-center gap-3">
              <Link href="/tickets">
                <Button variant="outline" data-testid="button-view-tickets">
                  <Ticket className="w-4 h-4 mr-2" />
                  Support Tickets
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Student Details Card */}
        <Card data-testid="card-student-details">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Student Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium" data-testid="text-student-name">{registration.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium flex items-center gap-2" data-testid="text-student-email">
                  <Mail className="w-4 h-4" />
                  {registration.email}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium flex items-center gap-2" data-testid="text-student-phone">
                  <Phone className="w-4 h-4" />
                  {registration.phone}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Registration Date</p>
                <p className="font-medium flex items-center gap-2" data-testid="text-registration-date">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(registration.createdAt), "MMM dd, yyyy")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Program & Campus Details Card */}
        <Card data-testid="card-program-details">
          <CardHeader>
            <CardTitle>Program & Campus Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Selected Program</p>
                <h3 className="text-lg font-semibold" data-testid="text-program-name">
                  {registration.program?.name || "N/A"}
                </h3>
                {registration.program?.description && (
                  <p className="text-sm text-muted-foreground mt-1" data-testid="text-program-description">
                    {registration.program.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Campus</p>
                  <p className="font-medium flex items-center gap-2" data-testid="text-campus-name">
                    <MapPin className="w-4 h-4" />
                    {registration.campus?.name || "N/A"}
                  </p>
                  {registration.campus?.city && (
                    <p className="text-sm text-muted-foreground" data-testid="text-campus-city">
                      {registration.campus.city}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Bed Type</p>
                  <p className="font-medium flex items-center gap-2" data-testid="text-bed-type">
                    <Bed className="w-4 h-4" />
                    {formatBedType(registration.bedType)}
                  </p>
                </div>

                {batch && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Batch</p>
                    <p className="font-medium" data-testid="text-batch">
                      {batch.name}
                    </p>
                  </div>
                )}

                {!batch && registration.preferredStartDate && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Preferred Start Date</p>
                    <p className="font-medium" data-testid="text-start-date">
                      {registration.preferredStartDate}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Status Card */}
        <Card data-testid="card-payment-status">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Status
            </CardTitle>
            <CardDescription>Current status of your registration and program fees</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Registration Fee</p>
                  {getPaymentStatusBadge(registrationFeePaid, registration.paymentStatus)}
                </div>
                {registrationFeePaid && (
                  <p className="text-2xl font-bold text-green-600" data-testid="text-registration-fee-amount">
                    ₹{totalRegistrationAmount.toLocaleString()}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Remaining Fee Status</p>
                  {getPaymentStatusBadge(
                    registration.remainingFeeStatus === "paid",
                    registration.remainingFeeStatus
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Dues Summary Card */}
        <Card data-testid="card-pending-dues">
          <CardHeader>
            <CardTitle>Fee Breakdown</CardTitle>
            <CardDescription>Summary of all fees and pending dues</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm font-medium">Total Program Fee</span>
                <span className="text-lg font-bold" data-testid="text-total-program-fee">
                  ₹{totalProgramFee.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  Registration Fee Paid
                  {registrationFeePaid && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                </span>
                <span className="font-medium text-green-600" data-testid="text-registration-paid">
                  - ₹{totalRegistrationAmount.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-t pt-3">
                <span className="font-medium">Program Fee Remaining</span>
                <span className="text-xl font-bold" data-testid="text-program-fee-remaining">
                  ₹{programFeeRemaining.toLocaleString()}
                </span>
              </div>

              {hostelMonthlyFee > 0 && (
                <div className="flex items-center justify-between py-2 border-t">
                  <span className="text-sm font-medium">Hostel Monthly Fee</span>
                  <span className="font-semibold" data-testid="text-hostel-monthly-fee">
                    ₹{hostelMonthlyFee.toLocaleString()}/month
                  </span>
                </div>
              )}
            </div>

            <div className="pt-4">
              <Button 
                className="w-full" 
                disabled={programFeeRemaining === 0 || createRemainingFeePaymentMutation.isPending}
                onClick={() => createRemainingFeePaymentMutation.mutate()}
                data-testid="button-pay-remaining"
              >
                {createRemainingFeePaymentMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : programFeeRemaining === 0 ? (
                  "All Fees Paid"
                ) : (
                  "Pay Remaining Fees"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Hostel Payments Card */}
        {user && <HostelPaymentsCard studentId={user.id} registrationId={registrationId} />}

        {/* Referral Program Card */}
        {user && <ReferralCard />}

        {/* Emergency Contact (if available) */}
        {registration.emergencyContact && (
          <Card data-testid="card-emergency-contact">
            <CardHeader>
              <CardTitle>Emergency Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium" data-testid="text-emergency-contact-name">
                  {registration.emergencyContact}
                </p>
              </div>
              {registration.emergencyPhone && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium flex items-center gap-2" data-testid="text-emergency-contact-phone">
                    <Phone className="w-4 h-4" />
                    {registration.emergencyPhone}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReferralCard() {
  const { toast } = useToast();
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customCode, setCustomCode] = useState("");

  const { data: myCode, isLoading: isLoadingCode } = useQuery<ReferralCode>({
    queryKey: ["/api/referral/my-code"],
  });

  const { data: myReferrals = [] } = useQuery<ReferralWithDetails[]>({
    queryKey: ["/api/referral/my-referrals"],
  });

  const { data: walletData } = useQuery<{
    wallet: ReferralWallet;
    transactions: ReferralWalletTransaction[];
  }>({
    queryKey: ["/api/referral/my-wallet"],
  });

  const customizeMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("PATCH", "/api/referral/my-code", { code });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to customize code");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/my-code"] });
      setIsCustomizing(false);
      setCustomCode("");
      toast({ title: "Code Updated", description: "Your referral code has been customized." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyCode = () => {
    if (myCode?.code) {
      navigator.clipboard.writeText(myCode.code);
      toast({ title: "Copied!", description: "Referral code copied to clipboard." });
    }
  };

  const shareCode = () => {
    if (myCode?.code) {
      const shareText = `Join MedPG Buddy for NEET-PG coaching! Use my referral code "${myCode.code}" during registration to get a discount. Register at ${window.location.origin}/register`;
      if (navigator.share) {
        navigator.share({ title: "MedPG Buddy Referral", text: shareText });
      } else {
        navigator.clipboard.writeText(shareText);
        toast({ title: "Copied!", description: "Share message copied to clipboard." });
      }
    }
  };

  const successfulReferrals = myReferrals.filter(
    (r) => r.status !== "pending"
  ).length;

  if (isLoadingCode) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="card-referral">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              <CardTitle>Refer & Earn</CardTitle>
            </div>
            {walletData?.wallet && walletData.wallet.balance > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWalletDialog(true)}
                data-testid="button-view-wallet"
              >
                <Wallet className="w-4 h-4 mr-1" />
                ₹{walletData.wallet.balance.toLocaleString("en-IN")}
              </Button>
            )}
          </div>
          <CardDescription>
            Share your referral code with friends. They get a discount, you earn rewards!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Referral Code Display */}
          {myCode && (
            <div className="bg-accent/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Your Referral Code</p>
                  <p className="text-2xl font-bold tracking-wider" data-testid="text-referral-code">
                    {myCode.code}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={copyCode} data-testid="button-copy-code">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={shareCode} data-testid="button-share-code">
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {!isCustomizing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setIsCustomizing(true);
                    setCustomCode(myCode.code);
                  }}
                >
                  Customize Code
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="Enter custom code"
                    className="h-8 text-sm"
                    maxLength={15}
                  />
                  <Button
                    size="sm"
                    onClick={() => customizeMutation.mutate(customCode)}
                    disabled={customizeMutation.isPending || customCode.length < 4}
                  >
                    {customizeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCustomizing(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Referral Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{myReferrals.length}</p>
              <p className="text-xs text-muted-foreground">Total Referrals</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{successfulReferrals}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">
                ₹{(walletData?.wallet?.totalEarned || 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">Total Earned</p>
            </div>
          </div>

          {/* Recent Referrals */}
          {myReferrals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Recent Referrals</h4>
              <div className="space-y-2">
                {myReferrals.slice(0, 5).map((referral) => (
                  <div key={referral.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate max-w-[150px]">
                        {referral.refereeEmail.split("@")[0]}***
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          referral.status === "reward_disbursed" || referral.status === "reward_approved"
                            ? "default"
                            : referral.status === "payment_confirmed"
                            ? "secondary"
                            : "outline"
                        }
                        className={
                          referral.status === "reward_disbursed" || referral.status === "reward_approved"
                            ? "bg-green-600 hover:bg-green-700 text-xs"
                            : "text-xs"
                        }
                      >
                        {referral.status === "reward_disbursed"
                          ? "Rewarded"
                          : referral.status === "reward_approved"
                          ? "Approved"
                          : referral.status === "payment_confirmed"
                          ? "Confirmed"
                          : "Pending"}
                      </Badge>
                      {referral.referrerRewardAmount > 0 && (
                        <span className="text-green-600 font-medium text-xs">
                          +₹{referral.referrerRewardAmount.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myReferrals.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <Gift className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No referrals yet. Share your code to start earning!</p>
            </div>
          )}

          {/* CTA to full referral page */}
          <Link href="/refer">
            <Button variant="outline" className="w-full mt-2">
              <Gift className="w-4 h-4 mr-2" />
              Refer a Friend & View Full Details
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Wallet Dialog */}
      <Dialog open={showWalletDialog} onOpenChange={setShowWalletDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-wallet">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Referral Wallet
            </DialogTitle>
            <DialogDescription>Your referral earnings and transaction history</DialogDescription>
          </DialogHeader>

          {walletData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-primary/10 rounded-lg">
                  <p className="text-lg font-bold">₹{walletData.wallet.balance.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-muted-foreground">Balance</p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-lg font-bold text-green-600">₹{walletData.wallet.totalEarned.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-muted-foreground">Earned</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-lg font-bold">₹{walletData.wallet.totalWithdrawn.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-muted-foreground">Withdrawn</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Transaction History</h4>
                <ScrollArea className="max-h-[300px]">
                  {walletData.transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
                  ) : (
                    <div className="space-y-2">
                      {walletData.transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-sm">
                          <div className="flex items-center gap-2">
                            {tx.type === "credit" ? (
                              <ArrowDownLeft className="w-4 h-4 text-green-600" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-red-600" />
                            )}
                            <span className="truncate max-w-[200px]">{tx.description}</span>
                          </div>
                          <span className={tx.type === "credit" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {tx.type === "credit" ? "+" : "-"}₹{tx.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function HostelPaymentsCard({ studentId, registrationId }: { studentId: string; registrationId: string | undefined | null }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [showManualPaymentDialog, setShowManualPaymentDialog] = useState(false);
  const [showPaymentHistoryDialog, setShowPaymentHistoryDialog] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<HostelPaymentPeriod | null>(null);
  
  // Manual payment form state
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [proofAssetId, setProofAssetId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string>("");

  // Fetch hostel payment periods
  const { data: hostelPeriods = [], isLoading: isLoadingPeriods } = useQuery<HostelPaymentPeriod[]>({
    queryKey: ['/api/students', studentId, 'hostel-periods', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/students/${studentId}/hostel-periods?year=${selectedYear}`);
      if (!response.ok) throw new Error("Failed to fetch hostel periods");
      return response.json();
    },
    enabled: !!studentId,
  });

  // Fetch payment history
  const { data: payments = [], isLoading: isLoadingPayments } = useQuery<Payment[]>({
    queryKey: ['/api/students', studentId, 'payments'],
    queryFn: async () => {
      const response = await fetch(`/api/students/${studentId}/payments`);
      if (!response.ok) throw new Error("Failed to fetch payments");
      return response.json();
    },
    enabled: !!studentId && showPaymentHistoryDialog,
  });

  // Create Razorpay order mutation
  const createPaymentOrderMutation = useMutation({
    mutationFn: async (period: HostelPaymentPeriod) => {
      if (!registrationId) throw new Error("Registration ID not found");
      
      const response = await apiRequest("POST", "/api/payments/create-order", {
        registrationId,
        amount: period.amountDue,
        paymentType: "hostel_fee",
        metadata: {
          periodId: period.id,
          studentId,
          year: period.year,
          month: period.month,
        },
      });
      const data = await response.json();
      if (!data.orderId) {
        throw new Error("Invalid payment response: missing orderId");
      }
      return data;
    },
    onSuccess: (data: { orderId: string }) => {
      // Invalidate hostel periods cache to refresh after payment
      queryClient.invalidateQueries({ queryKey: ['/api/students', studentId, 'hostel-periods'] });
      setLocation(`/payment-checkout?orderId=${data.orderId}&registrationId=${registrationId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Submit manual payment proof mutation
  const submitManualPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod || !registrationId) throw new Error("Missing required data");
      if (!proofUrl) throw new Error("Please upload payment proof");
      
      const response = await apiRequest("POST", "/api/admin/manual-payments", {
        registrationId,
        amount: selectedPeriod.amountDue,
        paymentType: "hostel_fee",
        paymentMethod,
        receiptNumber,
        paymentDate,
        proofUrl,
        metadata: {
          studentId,
          periodId: selectedPeriod.id,
          year: selectedPeriod.year,
          month: selectedPeriod.month,
        },
      });
      const data = await response.json();
      if (!data.id) {
        throw new Error("Invalid payment response: missing payment ID");
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment proof submitted for verification",
      });
      setShowManualPaymentDialog(false);
      resetManualPaymentForm();
      queryClient.invalidateQueries({ queryKey: ['/api/students', studentId, 'hostel-periods'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Error",
        description: error.message || "Failed to submit payment proof. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetManualPaymentForm = () => {
    setPaymentMethod("cash");
    setReceiptNumber("");
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setProofAssetId(null);
    setProofUrl("");
    setSelectedPeriod(null);
  };

  const handleManualPaymentClick = (period: HostelPaymentPeriod) => {
    setSelectedPeriod(period);
    setShowManualPaymentDialog(true);
  };

  const getStatusBadge = (period: HostelPaymentPeriod) => {
    const today = startOfDay(new Date());
    const dueDate = startOfDay(new Date(period.dueDate));
    const isOverdue = period.status === 'pending' && isBefore(dueDate, today);

    if (period.status === 'paid') {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid={`badge-status-${period.id}`}>
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Paid
        </Badge>
      );
    }
    
    if (isOverdue) {
      return (
        <Badge variant="destructive" className="bg-red-800 hover:bg-red-900" data-testid={`badge-status-${period.id}`}>
          Overdue
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="bg-red-600 hover:bg-red-700 text-white" data-testid={`badge-status-${period.id}`}>
        Unpaid
      </Badge>
    );
  };

  const getMonthName = (month: number) => {
    const date = new Date(2000, month - 1, 1);
    return format(date, "MMMM");
  };

  // Sort periods by month
  const sortedPeriods = [...hostelPeriods].sort((a, b) => a.month - b.month);

  // Generate year options (current year ±2)
  const yearOptions = [];
  for (let i = -2; i <= 2; i++) {
    yearOptions.push((currentYear + i).toString());
  }

  return (
    <>
      <Card data-testid="card-hostel-payments">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bed className="w-5 h-5" />
                Hostel Payments
              </CardTitle>
              <CardDescription>Track and manage your monthly hostel fee payments</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[140px]" data-testid="select-year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setShowPaymentHistoryDialog(true)}
                data-testid="button-payment-history"
              >
                <Receipt className="w-4 h-4 mr-2" />
                Payment History
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingPeriods ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedPeriods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-payments">
              No hostel payments found for this year
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-hostel-payments">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month/Year</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Receipt #</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPeriods.map((period) => {
                    const canPay = period.status === 'pending';
                    const isPaid = period.status === 'paid';
                    
                    return (
                      <TableRow key={period.id} data-testid={`row-period-${period.id}`}>
                        <TableCell className="font-medium">
                          {getMonthName(period.month)} {period.year}
                        </TableCell>
                        <TableCell>
                          {format(new Date(period.dueDate), "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell className="font-semibold">
                          ₹{period.amountDue.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(period)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {isPaid ? (period as any).paymentMethod?.replace(/_/g, ' ') || '-' : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {isPaid ? (period as any).receiptNumber || '-' : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {canPay && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => createPaymentOrderMutation.mutate(period)}
                                disabled={createPaymentOrderMutation.isPending}
                                data-testid={`button-pay-online-${period.id}`}
                              >
                                {createPaymentOrderMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <CreditCard className="w-3 h-3 mr-1" />
                                )}
                                Pay Online
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleManualPaymentClick(period)}
                                data-testid={`button-upload-proof-${period.id}`}
                              >
                                <Upload className="w-3 h-3 mr-1" />
                                Upload Proof
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Payment Proof Dialog */}
      <Dialog open={showManualPaymentDialog} onOpenChange={setShowManualPaymentDialog}>
        <DialogContent data-testid="dialog-manual-payment">
          <DialogHeader>
            <DialogTitle>Upload Manual Payment Proof</DialogTitle>
            <DialogDescription>
              Submit proof of your hostel fee payment for verification
              {selectedPeriod && ` - ${getMonthName(selectedPeriod.month)} ${selectedPeriod.year}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method" data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="demand_draft">Demand Draft</SelectItem>
                  <SelectItem value="card_on_campus">Card on Campus</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt-number">Receipt Number</Label>
              <Input
                id="receipt-number"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="Enter receipt number"
                data-testid="input-receipt-number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                data-testid="input-payment-date"
              />
            </div>

            <ImageUploadField
              label="Payment Proof"
              value={proofUrl}
              onChange={(assetId, imageUrl) => {
                setProofAssetId(assetId);
                setProofUrl(imageUrl || "");
              }}
              entityType="payment_proof"
              entityId={selectedPeriod?.id}
              required={true}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowManualPaymentDialog(false);
                resetManualPaymentForm();
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitManualPaymentMutation.mutate()}
              disabled={submitManualPaymentMutation.isPending || !proofUrl}
              data-testid="button-submit-proof"
            >
              {submitManualPaymentMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit for Verification"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showPaymentHistoryDialog} onOpenChange={setShowPaymentHistoryDialog}>
        <DialogContent className="max-w-4xl" data-testid="dialog-payment-history">
          <DialogHeader>
            <DialogTitle>Payment History</DialogTitle>
            <DialogDescription>
              View all your payment transactions
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[500px]">
            {isLoadingPayments ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No payment history found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Receipt #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {format(new Date(payment.createdAt), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentType.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="font-semibold">
                        ₹{payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={payment.status === 'captured' ? 'default' : 'secondary'}
                          className={
                            payment.status === 'captured'
                              ? 'bg-green-600 hover:bg-green-700'
                              : payment.status === 'created'
                              ? 'bg-yellow-600 hover:bg-yellow-700'
                              : ''
                          }
                        >
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentMethod || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {payment.receiptNumber || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <Skeleton className="h-10 w-80 mx-auto" />
          <Skeleton className="h-5 w-60 mx-auto" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ registrationId }: { registrationId: string | undefined | null }) {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-md w-full" data-testid="card-error">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <AlertCircle className="w-16 h-16 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold" data-testid="text-error-title">
              {!registrationId ? "No Registration Found" : "Registration Not Found"}
            </h2>
            <p className="text-muted-foreground" data-testid="text-error-message">
              {!registrationId 
                ? "You don't have a registration linked to your account yet. Please complete a program registration first."
                : "We couldn't find the registration you're looking for. Please check the registration ID and try again."
              }
            </p>
          </div>
          {user && (
            <Link href="/tickets">
              <Button variant="outline" className="w-full" data-testid="button-view-tickets-error">
                <Ticket className="w-4 h-4 mr-2" />
                View Support Tickets
              </Button>
            </Link>
          )}
          <Button asChild className="w-full" data-testid="button-go-home">
            <a href="/">Go to Home</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
