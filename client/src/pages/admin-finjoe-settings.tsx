import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Loader2, Copy, AlertCircle, Mail, MessageSquare, RefreshCw, Plus, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const TEMPLATES = [
  {
    id: "expense-approval",
    name: "Expense Approval Request",
    description: "Sent to finance when an expense needs manual approval (outside the 24h auto-approve window). Include {{1}} for expense ID and {{2}} for amount.",
    field: "expenseApprovalTemplateSid" as const,
    template: `Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.`,
  },
  {
    id: "expense-approved",
    name: "Expense Approved",
    description: "Sent to the submitter when their expense is approved. Include {{1}} for expense ID.",
    field: "expenseApprovedTemplateSid" as const,
    template: `Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.`,
  },
  {
    id: "expense-rejected",
    name: "Expense Rejected",
    description: "Sent to the submitter when their expense is rejected. Include {{1}} for expense ID and {{2}} for the rejection reason.",
    field: "expenseRejectedTemplateSid" as const,
    template: `Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.`,
  },
  {
    id: "re-engagement",
    name: "Re-engagement",
    description: "Sent to re-engage users who haven't messaged Finance Joe in over 24 hours. No placeholders required.",
    field: "reEngagementTemplateSid" as const,
    template: `Hello from Finance Joe! I'm here to help with expenses, income receipts, and any finance questions. Reply to get started or ask me anything.`,
  },
];

type FinJoeSettings = {
  expenseApprovalTemplateSid?: string | null;
  expenseApprovedTemplateSid?: string | null;
  expenseRejectedTemplateSid?: string | null;
  reEngagementTemplateSid?: string | null;
  notificationEmails?: string | null;
  resendFromEmail?: string | null;
  smsFrom?: string | null;
  costCenterLabel?: string | null;
  costCenterType?: string | null;
};

type WhatsAppProvider = {
  id: string;
  whatsappFrom: string;
  accountSid: string;
  authTokenMasked: string;
  hasAuthToken: boolean;
};

function getQueryKey(tenantId?: string | null) {
  return tenantId ? ["/api/admin/finjoe/settings", tenantId] : ["/api/admin/finjoe/settings"];
}

function getProviderQueryKey(tenantId?: string | null) {
  return tenantId ? ["/api/admin/finjoe/whatsapp-provider", tenantId] : ["/api/admin/finjoe/whatsapp-provider"];
}

export default function AdminFinJoeSettings({ tenantId: tenantIdProp }: { tenantId?: string | null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = tenantIdProp ?? user?.tenantId ?? null;
  const isSuperAdmin = user?.role === "super_admin";
  const [providerForm, setProviderForm] = useState({
    accountSid: "",
    authToken: "",
    whatsappFrom: "",
  });

  const settingsQueryKey = getQueryKey(tenantId);
  const providerQueryKey = getProviderQueryKey(tenantId);

  const { data: settings, isLoading: settingsLoading } = useQuery<FinJoeSettings | null>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const url = tenantId ? `/api/admin/finjoe/settings?tenantId=${tenantId}` : "/api/admin/finjoe/settings";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: provider, isLoading: providerLoading } = useQuery<WhatsAppProvider | null>({
    queryKey: providerQueryKey,
    queryFn: async () => {
      const url = tenantId ? `/api/admin/finjoe/whatsapp-provider?tenantId=${tenantId}` : "/api/admin/finjoe/whatsapp-provider";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const [templateForm, setTemplateForm] = useState<FinJoeSettings>({});
  const [channelsForm, setChannelsForm] = useState<FinJoeSettings>({});
  const [costCenterForm, setCostCenterForm] = useState<Pick<FinJoeSettings, "costCenterLabel" | "costCenterType">>({});
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testSmsTo, setTestSmsTo] = useState("");

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: FinJoeSettings) => {
      const body = tenantId ? { ...data, tenantId } : data;
      const res = await apiRequest("PATCH", "/api/admin/finjoe/settings", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast({ title: "Settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createTemplatesMutation = useMutation({
    mutationFn: async () => {
      const body = tenantId ? { tenantId } : {};
      const res = await fetch("/api/admin/finjoe/create-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (data as { error?: string; details?: string[] }).error;
        const details = (data as { details?: string[] }).details;
        throw new Error(details?.length ? `${err}: ${details.join("; ")}` : err || "Failed to create templates");
      }
      return data as { created: Record<string, string>; errors: string[] };
    },
    onSuccess: (data) => {
      if (Object.keys(data.created).length > 0) {
        setTemplateForm((prev) => ({ ...prev, ...data.created }));
      }
      const count = Object.keys(data.created).length;
      const msg =
        count > 0
          ? "Templates created. Click Submit for approval, then Sync from Twilio once approved (24–48 hours)."
          : "No templates were created.";
      toast({
        title: count > 0 ? "Templates created" : "Create templates",
        description: data.errors.length > 0 ? `${msg} Some errors: ${data.errors.join("; ")}` : msg,
      });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      const sids = {
        expenseApprovalTemplateSid: templateForm.expenseApprovalTemplateSid ?? settings?.expenseApprovalTemplateSid ?? "",
        expenseApprovedTemplateSid: templateForm.expenseApprovedTemplateSid ?? settings?.expenseApprovedTemplateSid ?? "",
        expenseRejectedTemplateSid: templateForm.expenseRejectedTemplateSid ?? settings?.expenseRejectedTemplateSid ?? "",
        reEngagementTemplateSid: templateForm.reEngagementTemplateSid ?? settings?.reEngagementTemplateSid ?? "",
      };
      const body = tenantId ? { tenantId, sids } : { sids };
      const res = await fetch("/api/admin/finjoe/submit-for-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (data as { error?: string }).error;
        const details = (data as { details?: string[] }).details;
        throw new Error(details?.length ? `${err}: ${details.join("; ")}` : err || "Failed to submit for approval");
      }
      return data as { submitted: string[]; alreadySubmitted?: string[]; errors: string[] };
    },
    onSuccess: (data) => {
      const count = data.submitted.length;
      const alreadyCount = data.alreadySubmitted?.length ?? 0;
      let msg: string;
      let title: string;
      if (count > 0) {
        title = "Submitted for approval";
        msg = "Templates submitted for approval. Approvals typically take 24–48 hours. Use Sync from Twilio once approved.";
      } else if (alreadyCount > 0) {
        title = "Already submitted";
        msg = "These templates were already submitted. Use Sync from Twilio once approved.";
      } else {
        title = "Submit for approval";
        msg = "No templates were submitted.";
      }
      if (data.errors.length > 0) msg += ` Some errors: ${data.errors.join("; ")}`;
      toast({ title, description: msg });
    },
    onError: (e: Error) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      const body = tenantId ? { tenantId } : {};
      const res = await fetch("/api/admin/finjoe/sync-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to sync templates");
      return data as { synced: Record<string, string>; skipped: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      if (Object.keys(data.synced).length > 0) {
        setTemplateForm((prev) => ({ ...prev, ...data.synced }));
      }
      const count = Object.keys(data.synced).length;
      const msg = count > 0 ? `Synced ${count} template(s) from Twilio.` : "No approved templates found.";
      toast({ title: "Sync complete", description: data.skipped.length > 0 ? `${msg} Skipped: ${data.skipped.join(", ")}` : msg });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const saveChannelsMutation = useMutation({
    mutationFn: async (data: Pick<FinJoeSettings, "notificationEmails" | "resendFromEmail" | "smsFrom">) => {
      const body = tenantId ? { ...data, tenantId } : data;
      const res = await apiRequest("PATCH", "/api/admin/finjoe/settings", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast({ title: "Notification channels saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const emailTo = testEmailTo.trim();
      const fallback = (channelsForm.notificationEmails ?? settings?.notificationEmails ?? "").split(",").map((e) => e.trim()).find((e) => e && e.includes("@"));
      const body = tenantId ? { tenantId, ...(emailTo ? { to: emailTo } : fallback ? { to: fallback } : {}) } : {};
      const res = await fetch("/api/admin/finjoe/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send test email");
      return data;
    },
    onSuccess: () => toast({ title: "Test email sent", description: "Check the recipient inbox." }),
    onError: (e: Error) => toast({ title: "Test email failed", description: e.message, variant: "destructive" }),
  });

  const testSmsMutation = useMutation({
    mutationFn: async () => {
      const phone = testSmsTo.trim();
      if (!phone || phone.replace(/\D/g, "").length < 10) throw new Error("Enter a valid phone number (at least 10 digits)");
      const body = tenantId ? { tenantId, to: phone } : { to: phone };
      const res = await fetch("/api/admin/finjoe/test-sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send test SMS");
      return data;
    },
    onSuccess: () => toast({ title: "Test SMS sent", description: "Check the recipient phone." }),
    onError: (e: Error) => toast({ title: "Test SMS failed", description: e.message, variant: "destructive" }),
  });

  const saveProviderMutation = useMutation({
    mutationFn: async (data: typeof providerForm) => {
      const body = tenantId ? { ...data, tenantId } : data;
      const res = await apiRequest("PUT", "/api/admin/finjoe/whatsapp-provider", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerQueryKey });
      toast({ title: "WhatsApp provider saved" });
      setProviderForm({ accountSid: "", authToken: "", whatsappFrom: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCopyTemplate = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Template copied" });
  };

  if ((!tenantId && !isSuperAdmin) || settingsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenantId && isSuperAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a tenant to configure settings.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="p-6">
          <CardTitle className="flex items-center gap-2 font-display">
            <Settings className="h-5 w-5" />
            WhatsApp Provider (Twilio)
          </CardTitle>
          <CardDescription className="text-base">
            Connect your Twilio WhatsApp Business API. Get credentials from Twilio Console. Use the webhook URL below in Twilio to receive messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="rounded-md bg-muted p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Webhook URL</p>
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {typeof window !== "undefined" ? `${window.location.origin}/webhook/finjoe` : "https://your-domain.com/webhook/finjoe"}
                </p>
                <p className="text-muted-foreground">
                  Set this in Twilio Console → Messaging → WhatsApp Sandbox (or your WhatsApp number) → Configure.
                </p>
              </div>
            </div>
          </div>

          {provider && (
            <div className="text-sm text-muted-foreground">
              Current: {provider.whatsappFrom} • Account SID: {provider.accountSid || "(not set)"}
              {provider.hasAuthToken && " • Auth token: ••••••••"}
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Account SID</Label>
              <Input
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={providerForm.accountSid || provider?.accountSid || ""}
                onChange={(e) => setProviderForm((f) => ({ ...f, accountSid: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Auth Token {provider?.hasAuthToken && "(leave blank to keep existing)"}</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={providerForm.authToken}
                onChange={(e) => setProviderForm((f) => ({ ...f, authToken: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>WhatsApp From Number</Label>
              <Input
                placeholder="whatsapp:+14155238886 or +14155238886"
                value={providerForm.whatsappFrom || provider?.whatsappFrom || ""}
                onChange={(e) => setProviderForm((f) => ({ ...f, whatsappFrom: e.target.value }))}
              />
            </div>
            <Button
              onClick={() =>
                saveProviderMutation.mutate({
                  accountSid: providerForm.accountSid || provider?.accountSid || "",
                  authToken: providerForm.authToken,
                  whatsappFrom: providerForm.whatsappFrom || provider?.whatsappFrom || "",
                })
              }
              disabled={
                !(providerForm.accountSid || provider?.accountSid) ||
                !(providerForm.whatsappFrom || provider?.whatsappFrom) ||
                saveProviderMutation.isPending
              }
            >
              {saveProviderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save WhatsApp Provider
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle className="font-display">Cost Center Labels</CardTitle>
          <CardDescription className="text-base">
            Configure how cost centers are displayed in your organization. Use "Campus" for education, "Branch" for retail, "Department" for corporate, or any custom label.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-2">
            <Label>Cost Center Label (e.g. Campus, Branch, Department)</Label>
            <Input
              placeholder="Cost Center"
              value={costCenterForm.costCenterLabel ?? settings?.costCenterLabel ?? ""}
              onChange={(e) => setCostCenterForm((f) => ({ ...f, costCenterLabel: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Cost Center Type (e.g. campus, branch, department)</Label>
            <Input
              placeholder="campus"
              value={costCenterForm.costCenterType ?? settings?.costCenterType ?? ""}
              onChange={(e) => setCostCenterForm((f) => ({ ...f, costCenterType: e.target.value }))}
            />
          </div>
          <Button
            onClick={() =>
              updateSettingsMutation.mutate({
                ...settings,
                costCenterLabel: costCenterForm.costCenterLabel ?? settings?.costCenterLabel ?? null,
                costCenterType: costCenterForm.costCenterType ?? settings?.costCenterType ?? null,
              })
            }
            disabled={updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Cost Center Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle className="font-display">Notification Channels</CardTitle>
          <CardDescription className="text-base">
            Configure fallback channels for when users are outside the WhatsApp 24-hour window. SMS and email ensure critical notifications (approvals, rejections) still reach recipients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-2">
            <Label>Notification Emails (comma-separated)</Label>
            <Input
              placeholder="finance@org.com, admin@org.com"
              value={channelsForm.notificationEmails ?? settings?.notificationEmails ?? ""}
              onChange={(e) => setChannelsForm((f) => ({ ...f, notificationEmails: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              Finance/admin emails to receive critical notifications (expense approval requests, role requests) when WhatsApp is unavailable.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Resend From Email (optional)</Label>
            <Input
              placeholder="FinJoe &lt;notifications@yourdomain.com&gt;"
              value={channelsForm.resendFromEmail ?? settings?.resendFromEmail ?? ""}
              onChange={(e) => setChannelsForm((f) => ({ ...f, resendFromEmail: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              Override default from address for emails. Requires RESEND_API_KEY and verified domain in Resend.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>SMS From Number (optional)</Label>
            <Input
              placeholder="+15558171150"
              value={channelsForm.smsFrom ?? settings?.smsFrom ?? ""}
              onChange={(e) => setChannelsForm((f) => ({ ...f, smsFrom: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              Twilio number for SMS fallback when outside 24h window. Leave blank to use WhatsApp number or TWILIO_SMS_FROM env.
            </p>
          </div>
          <Button
            onClick={() =>
              saveChannelsMutation.mutate({
                notificationEmails: channelsForm.notificationEmails ?? settings?.notificationEmails ?? null,
                resendFromEmail: channelsForm.resendFromEmail ?? settings?.resendFromEmail ?? null,
                smsFrom: channelsForm.smsFrom ?? settings?.smsFrom ?? null,
              })
            }
            disabled={saveChannelsMutation.isPending}
          >
            {saveChannelsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Notification Channels
          </Button>

          <div className="border-t pt-4 mt-6 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Test configuration</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Test email (optional; uses first notification email if blank)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="email@example.com"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testEmailMutation.mutate()}
                    disabled={testEmailMutation.isPending}
                    title="Send test email"
                  >
                    {testEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                    Send
                  </Button>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Test SMS (phone number required)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="+919876543210"
                    value={testSmsTo}
                    onChange={(e) => setTestSmsTo(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testSmsMutation.mutate()}
                    disabled={testSmsMutation.isPending || !testSmsTo.trim()}
                    title="Send test SMS"
                  >
                    {testSmsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle className="font-display">WhatsApp Message Templates</CardTitle>
          <CardDescription className="text-base">
            Step 1: <strong>Create templates</strong> to create the 4 FinJoe templates in Twilio. Step 2: <strong>Submit for approval</strong> to send them to WhatsApp. Step 3: Once approved (24–48 hours), use <strong>Sync from Twilio</strong> to pull SIDs. Or paste SIDs manually. Each template controls what Finance Joe sends in specific situations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 p-6">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="font-medium">{t.name}</Label>
                <Button variant="outline" size="sm" className="w-full sm:w-auto min-h-[44px] sm:min-h-0" onClick={() => handleCopyTemplate(t.template)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy template
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{t.description}</p>
              <pre className="bg-muted rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap">{t.template}</pre>
              <Input
                placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={templateForm[t.field] ?? settings?.[t.field] ?? ""}
                onChange={(e) => setTemplateForm((f) => ({ ...f, [t.field]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => createTemplatesMutation.mutate()}
              disabled={createTemplatesMutation.isPending || !provider?.accountSid}
            >
              {createTemplatesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create templates
            </Button>
            <Button
              variant="outline"
              onClick={() => submitForApprovalMutation.mutate()}
              disabled={
                submitForApprovalMutation.isPending ||
                !provider?.accountSid ||
                !(
                  (templateForm.expenseApprovalTemplateSid ?? settings?.expenseApprovalTemplateSid) ||
                  (templateForm.expenseApprovedTemplateSid ?? settings?.expenseApprovedTemplateSid) ||
                  (templateForm.expenseRejectedTemplateSid ?? settings?.expenseRejectedTemplateSid) ||
                  (templateForm.reEngagementTemplateSid ?? settings?.reEngagementTemplateSid)
                )
              }
            >
              {submitForApprovalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Submit for approval
            </Button>
            <Button
              variant="outline"
              onClick={() => syncTemplatesMutation.mutate()}
              disabled={syncTemplatesMutation.isPending || !provider?.accountSid}
            >
              {syncTemplatesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync from Twilio
            </Button>
            <Button
              onClick={() =>
                updateSettingsMutation.mutate({
                  expenseApprovalTemplateSid: templateForm.expenseApprovalTemplateSid ?? settings?.expenseApprovalTemplateSid,
                  expenseApprovedTemplateSid: templateForm.expenseApprovedTemplateSid ?? settings?.expenseApprovedTemplateSid,
                  expenseRejectedTemplateSid: templateForm.expenseRejectedTemplateSid ?? settings?.expenseRejectedTemplateSid,
                  reEngagementTemplateSid: templateForm.reEngagementTemplateSid ?? settings?.reEngagementTemplateSid,
                })
              }
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Templates
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
