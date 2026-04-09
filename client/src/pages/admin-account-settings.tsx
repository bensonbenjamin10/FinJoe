import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageHeader } from "@/components/layout/PageHeader";

type AccountSettings = {
  defaultNotificationEmails?: string | null;
  defaultResendFromEmail?: string | null;
  defaultSmsFrom?: string | null;
};

export default function AdminAccountSettings() {
  const { toast } = useToast();
  const [form, setForm] = useState<AccountSettings>({});

  const { data: settings, isLoading } = useQuery<AccountSettings>({
    queryKey: ["/api/admin/account-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/account-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AccountSettings) => {
      const res = await apiRequest("PATCH", "/api/admin/account-settings", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/account-settings"] });
      toast({ title: "Account settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Account-Level Notification Defaults"
        description="Platform-wide defaults. Apply when a tenant has no override configured in their FinJoe settings."
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Settings className="h-5 w-5" />
            Notification Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Default Notification Emails (comma-separated)</Label>
            <Input
              placeholder="platform@org.com, alerts@org.com"
              value={form.defaultNotificationEmails ?? settings?.defaultNotificationEmails ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultNotificationEmails: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              Fallback emails for critical notifications when tenant has none configured.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Default Resend From Email</Label>
            <Input
              placeholder="FinJoe &lt;notifications@yourdomain.com&gt;"
              value={form.defaultResendFromEmail ?? settings?.defaultResendFromEmail ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultResendFromEmail: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              Fallback from address for emails when a tenant has none. Requires email delivery to be connected and a
              verified sending domain.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Default SMS From Number</Label>
            <Input
              placeholder="+15558171150"
              value={form.defaultSmsFrom ?? settings?.defaultSmsFrom ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, defaultSmsFrom: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              Fallback Twilio number for SMS when tenant has none. Used when outside WhatsApp 24h window.
            </p>
          </div>
          <Button
            onClick={() =>
              saveMutation.mutate({
                defaultNotificationEmails: form.defaultNotificationEmails ?? settings?.defaultNotificationEmails ?? null,
                defaultResendFromEmail: form.defaultResendFromEmail ?? settings?.defaultResendFromEmail ?? null,
                defaultSmsFrom: form.defaultSmsFrom ?? settings?.defaultSmsFrom ?? null,
              })
            }
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Account Settings
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
