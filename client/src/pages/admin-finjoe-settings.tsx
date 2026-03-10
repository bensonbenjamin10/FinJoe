import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Loader2, Copy, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const TEMPLATES = [
  {
    id: "expense-approval",
    name: "Expense Approval Request",
    description: "Notify finance when an expense needs approval (outside 24h window)",
    field: "expenseApprovalTemplateSid" as const,
    template: `Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.`,
  },
  {
    id: "expense-approved",
    name: "Expense Approved",
    description: "Notify submitter when an expense is approved (outside 24h window)",
    field: "expenseApprovedTemplateSid" as const,
    template: `Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.`,
  },
  {
    id: "expense-rejected",
    name: "Expense Rejected",
    description: "Notify submitter when an expense is rejected (outside 24h window)",
    field: "expenseRejectedTemplateSid" as const,
    template: `Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.`,
  },
  {
    id: "re-engagement",
    name: "Re-engagement",
    description: "Re-engage users outside 24h window",
    field: "reEngagementTemplateSid" as const,
    template: `Hello from Finance Joe! I'm here to help with expenses, income receipts, and any finance questions. Reply to get started or ask me anything.`,
  },
];

type FinJoeSettings = {
  expenseApprovalTemplateSid?: string | null;
  expenseApprovedTemplateSid?: string | null;
  expenseRejectedTemplateSid?: string | null;
  reEngagementTemplateSid?: string | null;
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            WhatsApp Provider (Twilio)
          </CardTitle>
          <CardDescription>
            Connect your Twilio WhatsApp Business API. Get credentials from Twilio Console. The webhook URL for incoming messages is shown below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        <CardHeader>
          <CardTitle>Template SIDs</CardTitle>
          <CardDescription>
            Create these templates in Twilio Console → Content Templates, then paste the SIDs here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t.name}</Label>
                <Button variant="outline" size="sm" onClick={() => handleCopyTemplate(t.template)}>
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
        </CardContent>
      </Card>
    </div>
  );
}
