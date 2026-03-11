import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Setup from "@/pages/setup";
import AdminFinJoe from "@/pages/admin-finjoe";
import AdminIncome from "@/pages/admin-income";
import AdminTenants from "@/pages/admin-tenants";
import AdminTenantUsers from "@/pages/admin-tenant-users";
import AdminAccountSettings from "@/pages/admin-account-settings";
import { AdminShell } from "@/components/layout/AdminShell";
import { ProtectedRoute } from "@/components/protected-route";

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/setup" component={Setup} />
        <Route path="/login" component={Login} />
        <Route path="/admin/tenants/:id/users">
          <ProtectedRoute requireRoles={["super_admin"]}>
            <AdminShell>
              <AdminTenantUsers />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/account-settings">
          <ProtectedRoute requireRoles={["super_admin"]}>
            <AdminShell>
              <AdminAccountSettings />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tenants">
          <ProtectedRoute requireRoles={["super_admin"]}>
            <AdminShell>
              <AdminTenants />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/finjoe">
          <ProtectedRoute>
            <AdminShell>
              <AdminFinJoe />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/income">
          <ProtectedRoute>
            <AdminShell>
              <AdminIncome />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <Redirect to="/admin/finjoe" />
        </Route>
      </Switch>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
