import { useState } from "react";
import { useSearchParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, UserPlus, Settings, Building2 } from "lucide-react";
import AdminFinJoeContacts from "./admin-finjoe-contacts";
import AdminFinJoeRoleRequests from "./admin-finjoe-role-requests";
import AdminFinJoeSettings from "./admin-finjoe-settings";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";

export default function AdminFinJoe() {
  const [, setLocation] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState("contacts");
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isSuperAdmin,
  });

  const setTenant = (id: string | null) => {
    if (!id) {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.delete("tenantId");
        return next.toString() ? `?${next}` : "";
      });
    } else {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set("tenantId", id);
        return `?${next}`;
      });
    }
  };

  const headerActions = (
    <>
      {isSuperAdmin && (
        <>
          <Button variant="outline" size="sm" onClick={() => setLocation("/admin/account-settings")}>
            Account Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation("/admin/tenants")}>
            <Building2 className="h-4 w-4 mr-2" />
            Tenants
          </Button>
        </>
      )}
      {isSuperAdmin && tenants.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={tenantId || ""}
            onValueChange={(v) => setTenant(v || null)}
          >
            <SelectTrigger className="w-[180px] md:w-[200px]">
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );

  return (
    <AdminLayout headerActions={headerActions} title="FinJoe Admin">
      <PageHeader
        title="Manage your organization's Finance Joe"
        description="Contacts, role requests, and WhatsApp settings"
      />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="mb-4 flex w-full overflow-x-auto md:w-auto md:flex-initial">
          <TabsTrigger value="contacts" className="gap-2 shrink-0">
            <MessageCircle className="h-4 w-4" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="role-requests" className="gap-2 shrink-0">
            <UserPlus className="h-4 w-4" />
            Role Requests
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2 shrink-0">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contacts">
          <AdminFinJoeContacts tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="role-requests">
          <AdminFinJoeRoleRequests tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="settings">
          <AdminFinJoeSettings tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
