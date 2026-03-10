import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MessageCircle, UserPlus, LogOut } from "lucide-react";
import AdminFinJoeContacts from "./admin-finjoe-contacts";
import AdminFinJoeRoleRequests from "./admin-finjoe-role-requests";
import { useAuth } from "@/hooks/use-auth";

export default function AdminFinJoe() {
  const [tab, setTab] = useState("contacts");
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">FinJoe Admin</h1>
        <div className="flex items-center gap-4">
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
        </TabsList>
        <TabsContent value="contacts">
          <AdminFinJoeContacts />
        </TabsContent>
        <TabsContent value="role-requests">
          <AdminFinJoeRoleRequests />
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
}
