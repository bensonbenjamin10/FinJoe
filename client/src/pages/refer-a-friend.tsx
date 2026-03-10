import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Gift, Copy, Share2, Wallet, UserPlus, Users, TrendingUp,
  ArrowLeft, Send, CheckCircle2, Clock, Phone, Mail,
  Loader2, ArrowDownLeft, ArrowUpRight, Sparkles, Heart, Star,
  MessageCircle, ChevronRight, AlertCircle,
} from "lucide-react";
import type {
  ReferralCode, ReferralWithDetails, ReferralWallet,
  ReferralWalletTransaction, ReferralLead,
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format, formatDistanceToNow } from "date-fns";

const referFriendSchema = z.object({
  friendName: z.string().min(2, "Name must be at least 2 characters"),
  friendPhone: z.string().min(10, "Enter a valid phone number"),
  friendEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  examPreparing: z.string().optional(),
  personalMessage: z.string().max(500).optional(),
});

type ReferFriendForm = z.infer<typeof referFriendSchema>;

export default function ReferAFriend() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customCode, setCustomCode] = useState("");

  const { data: myCode, isLoading: isLoadingCode } = useQuery<ReferralCode>({
    queryKey: ["/api/referral/my-code"],
  });

  const { data: myReferrals = [] } = useQuery<ReferralWithDetails[]>({
    queryKey: ["/api/referral/my-referrals"],
  });

  const { data: leadsData } = useQuery<{
    leads: ReferralLead[];
    monthCount: number;
    monthLimit: number;
  }>({
    queryKey: ["/api/referral/leads"],
  });

  const { data: walletData } = useQuery<{
    wallet: ReferralWallet;
    transactions: ReferralWalletTransaction[];
  }>({
    queryKey: ["/api/referral/my-wallet"],
  });

  const form = useForm<ReferFriendForm>({
    resolver: zodResolver(referFriendSchema),
    defaultValues: {
      friendName: "",
      friendPhone: "",
      friendEmail: "",
      examPreparing: "",
      personalMessage: "",
    },
  });

  const submitLeadMutation = useMutation({
    mutationFn: async (data: ReferFriendForm) => {
      const response = await apiRequest("POST", "/api/referral/leads", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit referral");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/referral/my-referrals"] });
      form.reset();
      setShowSuccessDialog(true);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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

  const shareViaWhatsApp = () => {
    if (myCode?.code) {
      const text = encodeURIComponent(
        `Hey! I'm studying at MedPG Buddy for NEET-PG and it's been amazing. If you're preparing too, use my referral code "${myCode.code}" during registration to get a discount!\n\nRegister here: ${window.location.origin}/register`
      );
      window.open(`https://wa.me/?text=${text}`, "_blank");
    }
  };

  const shareGeneric = () => {
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

  const leads = leadsData?.leads || [];
  const monthCount = leadsData?.monthCount || 0;
  const monthLimit = leadsData?.monthLimit || 50;
  const successfulReferrals = myReferrals.filter((r) => r.status !== "pending").length;
  const wallet = walletData?.wallet;

  const getLeadStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
      submitted: { label: "Submitted", variant: "outline" },
      contacted: { label: "Contacted", variant: "secondary" },
      interested: { label: "Interested", variant: "default", className: "bg-blue-600" },
      registered: { label: "Registered", variant: "default", className: "bg-green-600" },
      not_interested: { label: "Not Interested", variant: "secondary" },
    };
    const c = config[status] || config.submitted;
    return <Badge variant={c.variant} className={c.className}>{c.label}</Badge>;
  };

  if (isLoadingCode) {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-b">
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          <Link href="/student-dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
                <Gift className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                Refer & Earn
              </h1>
              <p className="text-muted-foreground mt-2 text-base md:text-lg max-w-lg">
                Help your juniors and friends discover MedPG. They get a discount, you earn rewards.
              </p>
            </div>

            {wallet && wallet.totalEarned > 0 && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowWalletDialog(true)}
                className="self-start"
              >
                <Wallet className="w-5 h-5 mr-2" />
                Wallet: ₹{wallet.balance.toLocaleString("en-IN")}
              </Button>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="bg-background/80 backdrop-blur rounded-xl p-4 border">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Send className="w-4 h-4" />
                <span className="text-xs">Leads Sent</span>
              </div>
              <p className="text-2xl font-bold">{leads.length}</p>
            </div>
            <div className="bg-background/80 backdrop-blur rounded-xl p-4 border">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">Referrals</span>
              </div>
              <p className="text-2xl font-bold">{myReferrals.length}</p>
            </div>
            <div className="bg-background/80 backdrop-blur rounded-xl p-4 border">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{successfulReferrals}</p>
            </div>
            <div className="bg-background/80 backdrop-blur rounded-xl p-4 border">
              <div className="flex items-center gap-2 text-primary mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs">Total Earned</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                ₹{(wallet?.totalEarned || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Referral Code + Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Referral Code Card */}
            {myCode && (
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-primary/5 to-accent/5 p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Your Referral Code</p>
                      <p className="text-3xl font-bold tracking-widest font-mono">{myCode.code}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={copyCode} title="Copy code">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={shareGeneric} title="Share">
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button size="sm" onClick={shareViaWhatsApp} className="bg-green-600 hover:bg-green-700">
                      <MessageCircle className="w-4 h-4 mr-1.5" />
                      Share on WhatsApp
                    </Button>
                    {!isCustomizing ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setIsCustomizing(true); setCustomCode(myCode.code); }}
                      >
                        Customize Code
                      </Button>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <Input
                          value={customCode}
                          onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                          className="h-8 w-36 text-sm font-mono"
                          maxLength={15}
                          placeholder="4-15 chars"
                        />
                        <Button
                          size="sm"
                          onClick={() => customizeMutation.mutate(customCode)}
                          disabled={customizeMutation.isPending || customCode.length < 4}
                        >
                          {customizeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsCustomizing(false)}>Cancel</Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Refer a Friend Form */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-primary" />
                    <CardTitle>Refer a Friend</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {monthCount}/{monthLimit} this month
                  </Badge>
                </div>
                <CardDescription>
                  Share your friend's details and we'll reach out to them with a personalized message mentioning you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {monthCount >= monthLimit ? (
                  <div className="text-center py-8 space-y-3">
                    <AlertCircle className="w-12 h-12 mx-auto text-yellow-500" />
                    <p className="font-semibold">Monthly limit reached</p>
                    <p className="text-sm text-muted-foreground">
                      You've submitted {monthLimit} referrals this month. The limit resets next month.
                    </p>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => submitLeadMutation.mutate(data))} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="friendName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Friend's Name *</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., Dr. Priya Sharma" {...field} className="h-11" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="friendPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number *</FormLabel>
                              <FormControl>
                                <Input type="tel" placeholder="9876543210" {...field} className="h-11" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="friendEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email (Optional)</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="friend@example.com" {...field} className="h-11" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="examPreparing"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Exam Preparing For</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Select exam" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="neet_pg">NEET-PG</SelectItem>
                                  <SelectItem value="ini_cet">INI-CET</SelectItem>
                                  <SelectItem value="fmge">FMGE</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="personalMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Personal Message (Optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="e.g., Hey, I've been studying here and the faculty is great. You should check it out!"
                                className="resize-none min-h-[80px]"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground mt-1">
                              We'll include this in our outreach to make it more personal.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-semibold"
                        disabled={submitLeadMutation.isPending}
                      >
                        {submitLeadMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Submit Referral
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - How It Works + Quick Actions */}
          <div className="space-y-6">
            {/* How It Works */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  How It Works
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { step: "1", icon: UserPlus, title: "Submit their details", desc: "Enter your friend's name and phone number" },
                  { step: "2", icon: MessageCircle, title: "We reach out", desc: "Our team contacts them mentioning you" },
                  { step: "3", icon: CheckCircle2, title: "They register", desc: "Your referral code is auto-applied for a discount" },
                  { step: "4", icon: Gift, title: "You earn rewards", desc: "Get cash rewards credited to your wallet" },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{item.step}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Tips Card */}
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Pro Tips</p>
                </div>
                <ul className="space-y-2 text-xs text-amber-700 dark:text-amber-300">
                  <li className="flex gap-2">
                    <Heart className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>Refer friends who are actively preparing - they're more likely to join</span>
                  </li>
                  <li className="flex gap-2">
                    <Heart className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>Add a personal message - it makes our outreach 3x more effective</span>
                  </li>
                  <li className="flex gap-2">
                    <Heart className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>Share your code on WhatsApp groups for batch mates</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Wallet Quick View */}
            {wallet && (
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowWalletDialog(true)}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">Your Wallet</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="text-lg font-bold">₹{wallet.balance.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Earned</p>
                      <p className="text-lg font-bold text-green-600">₹{wallet.totalEarned.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Leads & Referrals Tracking */}
        <div className="mt-8">
          <Tabs defaultValue="leads">
            <TabsList>
              <TabsTrigger value="leads">
                <Send className="w-4 h-4 mr-1.5" />
                My Leads ({leads.length})
              </TabsTrigger>
              <TabsTrigger value="referrals">
                <Users className="w-4 h-4 mr-1.5" />
                My Referrals ({myReferrals.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leads">
              <Card>
                <CardContent className="p-0">
                  {leads.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <UserPlus className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="font-medium text-muted-foreground">No leads submitted yet</p>
                      <p className="text-sm text-muted-foreground mt-1">Use the form above to refer your first friend!</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {leads.map((lead) => (
                        <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-primary">
                                {lead.friendName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{lead.friendName}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Phone className="w-3 h-3" />
                                <span>{lead.friendPhone}</span>
                                {lead.friendEmail && (
                                  <>
                                    <Mail className="w-3 h-3 ml-1" />
                                    <span className="truncate max-w-[120px]">{lead.friendEmail}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs text-muted-foreground hidden md:block">
                              {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                            </span>
                            {getLeadStatusBadge(lead.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="referrals">
              <Card>
                <CardContent className="p-0">
                  {myReferrals.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <Gift className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="font-medium text-muted-foreground">No referral completions yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        When someone uses your code to register and pay, they'll appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {myReferrals.map((referral) => (
                        <div key={referral.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {referral.refereeEmail.split("@")[0]}***
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(referral.createdAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={referral.status === "reward_approved" || referral.status === "reward_disbursed" ? "default" : "secondary"}
                              className={
                                referral.status === "reward_approved" || referral.status === "reward_disbursed"
                                  ? "bg-green-600 hover:bg-green-700"
                                  : ""
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
                              <span className="text-green-600 font-semibold text-sm">
                                +₹{referral.referrerRewardAmount.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <DialogTitle className="text-xl mb-2">Referral Submitted!</DialogTitle>
            <DialogDescription className="text-base">
              Thanks for referring your friend! Our team will reach out to them soon. You'll be notified when they register.
            </DialogDescription>
            <Button className="mt-6 w-full" onClick={() => setShowSuccessDialog(false)}>
              Refer Another Friend
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Dialog */}
      <Dialog open={showWalletDialog} onOpenChange={setShowWalletDialog}>
        <DialogContent className="max-w-md">
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
                        <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {tx.type === "credit" ? (
                              <ArrowDownLeft className="w-4 h-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-red-600 flex-shrink-0" />
                            )}
                            <span className="truncate">{tx.description}</span>
                          </div>
                          <span className={`flex-shrink-0 font-medium ${tx.type === "credit" ? "text-green-600" : "text-red-600"}`}>
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
    </div>
  );
}
