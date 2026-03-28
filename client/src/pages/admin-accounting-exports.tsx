import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Link2, RefreshCw, Unplug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ZohoStatus = {
  connected: boolean;
  organizationId: string | null;
  tokenExpiresAt: string | null;
};

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function AdminAccountingExports({ tenantId }: { tenantId: string | null }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const dr = defaultDateRange();
  const [from, setFrom] = useState(dr.from);
  const [to, setTo] = useState(dr.to);
  const [csvKind, setCsvKind] = useState<"bills" | "income">("bills");

  const tenantQs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const { data: zohoStatus, isLoading: zohoLoading } = useQuery<ZohoStatus>({
    queryKey: ["/api/admin/integrations/zoho/status", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/integrations/zoho/status${tenantQs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/integrations/zoho/disconnect", { tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/zoho/status"] });
      toast({ title: "Zoho disconnected" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const syncImport = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/integrations/zoho/sync/import", { tenantId });
      return res.json();
    },
    onSuccess: (data) => {
      const coa = Array.isArray(data.chartofaccounts) ? data.chartofaccounts.length : 0;
      const contacts = Array.isArray(data.contacts) ? data.contacts.length : 0;
      toast({ title: "Imported from Zoho", description: `${coa} accounts, ${contacts} contacts` });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const downloadUrl = (path: string) => {
    const qs = new URLSearchParams({ from, to });
    if (tenantId) qs.set("tenantId", tenantId);
    return `${path}?${qs.toString()}`;
  };

  const downloadZohoCsvUrl = () => {
    const qs = new URLSearchParams({ from, to, kind: csvKind });
    if (tenantId) qs.set("tenantId", tenantId);
    return `/api/admin/accounting-export/zoho-csv?${qs.toString()}`;
  };

  const oauthStartUrl =
    isSuperAdmin && tenantId
      ? `/api/admin/integrations/zoho/oauth/start?tenantId=${encodeURIComponent(tenantId)}`
      : "/api/admin/integrations/zoho/oauth/start";

  if (!tenantId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accounting export</CardTitle>
          <CardDescription>Select a tenant (super admin) or use a tenant user to export data.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            File export (Tally / Zoho CSV)
          </CardTitle>
          <CardDescription>
            Download Tally XML or Zoho-friendly CSV for the selected period. Amounts use your existing expense and income
            records.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="exp-from">From</Label>
            <Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-to">To</Label>
            <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="secondary" asChild>
            <a href={downloadUrl("/api/admin/accounting-export/tally")} download>
              <Download className="mr-2 h-4 w-4" />
              Tally XML
            </a>
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Label>CSV type</Label>
              <Select value={csvKind} onValueChange={(v) => setCsvKind(v as "bills" | "income")}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bills">Bills (expenses)</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="secondary" asChild>
              <a href={downloadZohoCsvUrl()} download>
                <Download className="mr-2 h-4 w-4" />
                Zoho CSV
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Zoho Books
          </CardTitle>
          <CardDescription>
            Connect Zoho Books (India: <code className="text-xs">zoho.in</code>) to pull chart of accounts and contacts,
            and push expenses as bills. Set{" "}
            <code className="text-xs">ZOHO_CLIENT_ID</code>, <code className="text-xs">ZOHO_CLIENT_SECRET</code>,{" "}
            <code className="text-xs">ZOHO_REDIRECT_URI</code> on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {zohoLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">
              Status:{" "}
              <strong>{zohoStatus?.connected ? "Connected" : "Not connected"}</strong>
              {zohoStatus?.organizationId && (
                <span className="ml-2">· Org {zohoStatus.organizationId}</span>
              )}
            </p>
          )}
          <Button variant="default" asChild>
            <a href={oauthStartUrl}>
              <Link2 className="mr-2 h-4 w-4" />
              Connect Zoho
            </a>
          </Button>
          <Button
            variant="outline"
            disabled={!zohoStatus?.connected || syncImport.isPending}
            onClick={() => syncImport.mutate()}
          >
            {syncImport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Import accounts & contacts
          </Button>
          <Button
            variant="ghost"
            disabled={disconnect.isPending || !zohoStatus?.connected}
            onClick={() => disconnect.mutate()}
          >
            <Unplug className="mr-2 h-4 w-4" />
            Disconnect
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
