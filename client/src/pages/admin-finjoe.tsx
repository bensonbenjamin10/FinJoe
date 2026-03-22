import { useState, useEffect } from "react";
import { useSearchParams } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, UserPlus, Settings, Building2 } from "lucide-react";
import AdminFinJoeContacts from "./admin-finjoe-contacts";
import AdminFinJoeRoleRequests from "./admin-finjoe-role-requests";
import AdminFinJoeSettings from "./admin-finjoe-settings";
import AdminCostCenters from "./admin-cost-centers";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/use-auth";

export default function AdminFinJoe() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState("cost-centers");
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const canManageFinJoe = user?.role === "admin" || user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;

  useEffect(() => {
    if (user && !canManageFinJoe) {
      setTab("role-requests");
    }
  }, [user, canManageFinJoe]);

  return (
    <>
      <PageHeader
        title="Manage your organization's Finance Joe"
        description="Contacts, role requests, and WhatsApp settings"
      />
      <OnboardingChecklist tenantId={tenantId} currentTab={tab} onTabChange={setTab} />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="mb-4 flex w-full overflow-x-auto md:w-auto md:flex-initial">
          {canManageFinJoe && (
            <TabsTrigger value="cost-centers" className="gap-2 shrink-0">
              <Building2 className="h-4 w-4" />
              Cost Centers
            </TabsTrigger>
          )}
          {canManageFinJoe && (
            <TabsTrigger value="contacts" className="gap-2 shrink-0">
              <MessageCircle className="h-4 w-4" />
              Contacts
            </TabsTrigger>
          )}
          <TabsTrigger value="role-requests" className="gap-2 shrink-0">
            <UserPlus className="h-4 w-4" />
            Role Requests
          </TabsTrigger>
          {canManageFinJoe && (
            <TabsTrigger value="settings" className="gap-2 shrink-0">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          )}
        </TabsList>
        {canManageFinJoe && (
          <TabsContent value="cost-centers">
            <AdminCostCenters tenantId={tenantId} />
          </TabsContent>
        )}
        {canManageFinJoe && (
          <TabsContent value="contacts">
            <AdminFinJoeContacts tenantId={tenantId} />
          </TabsContent>
        )}
        <TabsContent value="role-requests">
          <AdminFinJoeRoleRequests tenantId={tenantId} />
        </TabsContent>
        {canManageFinJoe && (
          <TabsContent value="settings">
            <AdminFinJoeSettings tenantId={tenantId} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
