import { useState } from "react";
import { useSearchParams } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, UserPlus, Settings } from "lucide-react";
import AdminFinJoeContacts from "./admin-finjoe-contacts";
import AdminFinJoeRoleRequests from "./admin-finjoe-role-requests";
import AdminFinJoeSettings from "./admin-finjoe-settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/hooks/use-auth";

export default function AdminFinJoe() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState("contacts");
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;

  return (
    <>
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
    </>
  );
}
