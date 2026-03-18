import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Setup from "@/pages/setup";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminFinJoe from "@/pages/admin-finjoe";
import AdminExpenses from "@/pages/admin-expenses";
import AdminIncome from "@/pages/admin-income";
import AdminRecurringTemplates from "@/pages/admin-recurring-templates";
import AdminRecurringIncomeTemplates from "@/pages/admin-recurring-income-templates";
import AdminCron from "@/pages/admin-cron";
import AdminTenants from "@/pages/admin-tenants";
import AdminTenantUsers from "@/pages/admin-tenant-users";
import AdminAccountSettings from "@/pages/admin-account-settings";
import AdminReconciliation from "@/pages/admin-reconciliation";
import AdminReports from "@/pages/admin-reports";
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
        <Route path="/admin/cron">
          <ProtectedRoute requireRoles={["super_admin"]}>
            <AdminShell>
              <AdminCron />
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
        <Route path="/admin/dashboard">
          <ProtectedRoute>
            <AdminShell>
              <AdminDashboard />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/reports">
          <ProtectedRoute>
            <AdminShell>
              <AdminReports />
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
        <Route path="/admin/expenses">
          <ProtectedRoute>
            <AdminShell>
              <AdminExpenses />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/recurring-templates">
          <ProtectedRoute>
            <AdminShell>
              <AdminRecurringTemplates />
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
        <Route path="/admin/recurring-income-templates">
          <ProtectedRoute>
            <AdminShell>
              <AdminRecurringIncomeTemplates />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/reconciliation">
          <ProtectedRoute>
            <AdminShell>
              <AdminReconciliation />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <Redirect to="/admin/dashboard" />
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
