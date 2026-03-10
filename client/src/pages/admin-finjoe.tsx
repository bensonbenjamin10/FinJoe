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
import { MessageCircle, UserPlus, LogOut, Settings, Building2 } from "lucide-react";
import AdminFinJoeContacts from "./admin-finjoe-contacts";
import AdminFinJoeRoleRequests from "./admin-finjoe-role-requests";
import AdminFinJoeSettings from "./admin-finjoe-settings";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";

export default function AdminFinJoe() {
  const [, setLocation] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState("contacts");
  const { user, logout } = useAuth();
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">FinJoe Admin — Manage your organization's Finance Joe</h1>
        <div className="flex items-center gap-4 flex-wrap">
          {isSuperAdmin && (
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin/tenants")}>
              <Building2 className="h-4 w-4 mr-2" />
              Tenants
            </Button>
          )}
          {isSuperAdmin && tenants.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select
                value={tenantId || ""}
                onValueChange={(v) => setTenant(v || null)}
              >
                <SelectTrigger className="w-[200px]">
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
          {user && <span className="text-sm text-muted-foreground">{user.email}</span>}
          <Button variant="outline" size="sm" onClick={() => logout()}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>
    <div className="container max-w-5xl py-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="contacts" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="role-requests" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Role Requests
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
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
    </div>
    </div>
  );
}
