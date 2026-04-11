import { useState, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/SplashScreen";
import Landing from "@/pages/landing";
import Support from "@/pages/support";
import Login from "@/pages/login";
import Setup from "@/pages/setup";
import Signup from "@/pages/signup";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminFinJoeHub from "@/pages/admin-finjoe-hub";
import { LegacyTeamRedirect } from "@/components/FinJoeRedirect";
import { FINJOE_AREA_PATH_PATTERN } from "@/lib/finjoe-routes";
import AdminExpenses from "@/pages/admin-expenses";
import AdminPettyCash from "@/pages/admin-petty-cash";
import AdminIncome from "@/pages/admin-income";
import AdminRecurringTemplates from "@/pages/admin-recurring-templates";
import AdminRecurringIncomeTemplates from "@/pages/admin-recurring-income-templates";
import AdminCron from "@/pages/admin-cron";
import AdminTenants from "@/pages/admin-tenants";
import AdminTenantUsers from "@/pages/admin-tenant-users";
import AdminAccountSettings from "@/pages/admin-account-settings";
import AdminSuperHub from "@/pages/admin-super-hub";
import AdminSuperUsers from "@/pages/admin-super-users";
import AdminReconciliation from "@/pages/admin-reconciliation";
import AdminDataHandling from "@/pages/admin-data-handling";
import AdminReports from "@/pages/admin-reports";
import AcceptInvite from "@/pages/accept-invite";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AdminInvoiceNew from "@/pages/admin-invoice-new";
import AdminInvoicing from "@/pages/admin-invoicing";
import AdminInvoiceDetail from "@/pages/admin-invoice-detail";
import AdminInvoicingCustomers from "@/pages/admin-invoicing-customers";
import InvoicePay from "@/pages/invoice-pay";
import PaymentCheckout from "@/pages/payment-checkout";
import PaymentSuccess from "@/pages/payment-success";
import PublicDashboard from "@/pages/public-dashboard";
import { AdminShell } from "@/components/layout/AdminShell";
import { ProtectedRoute } from "@/components/protected-route";
import AdminKnowledgeBase from "@/pages/admin-knowledge-base";
import AdminMyApprovals from "@/pages/admin-my-approvals";
import AdminApprovalRules from "@/pages/admin-approval-rules";

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/support" component={Support} />
        <Route path="/setup" component={Setup} />
        <Route path="/signup" component={Signup} />
        <Route path="/accept-invite" component={AcceptInvite} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/login" component={Login} />
        <Route path="/admin/super/users">
          <ProtectedRoute requireRoles={["super_admin"]}>
            <AdminShell>
              <AdminSuperUsers />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/super">
          <ProtectedRoute requireRoles={["super_admin"]}>
            <AdminShell>
              <AdminSuperHub />
            </AdminShell>
          </ProtectedRoute>
        </Route>
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
        <Route path="/admin/team">
          <ProtectedRoute requireRoles={["admin", "super_admin"]}>
            <LegacyTeamRedirect />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/help/:slug">
          <ProtectedRoute>
            <AdminShell>
              <AdminKnowledgeBase />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/help">
          <ProtectedRoute>
            <AdminShell>
              <AdminKnowledgeBase />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/my-approvals">
          <ProtectedRoute>
            <AdminShell>
              <AdminMyApprovals />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/approval-rules">
          <ProtectedRoute requireRoles={["admin", "super_admin"]}>
            <AdminShell>
              <AdminApprovalRules />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path={FINJOE_AREA_PATH_PATTERN}>
          <ProtectedRoute>
            <AdminShell>
              <AdminFinJoeHub />
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
        <Route path="/admin/expenses">
          <ProtectedRoute>
            <AdminShell>
              <AdminExpenses />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/petty-cash">
          <ProtectedRoute>
            <AdminShell>
              <AdminPettyCash />
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
        <Route path="/admin/data-handling">
          <ProtectedRoute>
            <AdminShell>
              <AdminDataHandling />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoicing/new">
          <ProtectedRoute>
            <AdminShell>
              <AdminInvoiceNew />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoicing/customers">
          <ProtectedRoute>
            <AdminShell>
              <AdminInvoicingCustomers />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoicing/:id">
          <ProtectedRoute>
            <AdminShell>
              <AdminInvoiceDetail />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoicing">
          <ProtectedRoute>
            <AdminShell>
              <AdminInvoicing />
            </AdminShell>
          </ProtectedRoute>
        </Route>
        <Route path="/pay/:invoiceId" component={InvoicePay} />
        <Route path="/payment-checkout" component={PaymentCheckout} />
        <Route path="/payment-success" component={PaymentSuccess} />
        <Route path="/dashboard/:slug" component={PublicDashboard} />
        <Route path="/admin">
          <Redirect to="/admin/dashboard" />
        </Route>
      </Switch>
    </div>
  );
}

const SPLASH_MS = 3000;

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {showSplash ? <SplashScreen /> : <Router />}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
