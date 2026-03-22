import { Switch, Route, Redirect, Link, useLocation } from "wouter";
import { useSearchParams } from "wouter";
import { Building2, MessageCircle, Settings, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { FinJoeRootRedirect } from "@/components/FinJoeRedirect";
import { useAuth } from "@/hooks/use-auth";
import AdminCostCenters from "./admin-cost-centers";
import AdminFinJoeContacts from "./admin-finjoe-contacts";
import AdminFinJoeRoleRequests from "./admin-finjoe-role-requests";
import AdminFinJoeSettings from "./admin-finjoe-settings";
import AdminTeam from "./admin-team";
import {
  FINJOE_PATHS,
  finjoePathToChecklistTab,
  finjoePathWithTenant,
} from "@/lib/finjoe-routes";
import { cn } from "@/lib/utils";

/**
 * FinJoe organization area: shared chrome + sub-navigation + section body.
 * Mounted once for all `/admin/finjoe/...` URLs (see FINJOE_AREA_PATH_PATTERN in App).
 */
export default function AdminFinJoeHub() {
  const [location, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const canManageFinJoe = user?.role === "admin" || user?.role === "super_admin";
  const urlTenantId = searchParams.get("tenantId");
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;

  const href = (path: string) => finjoePathWithTenant(path, tenantId, isSuperAdmin);

  const pathOnly = location.split("?")[0];
  if (pathOnly === "/admin/finjoe" || pathOnly === "/admin/finjoe/") {
    return <FinJoeRootRedirect />;
  }

  if (
    pathOnly.startsWith("/admin/finjoe/people/users") &&
    user &&
    user.role !== "admin" &&
    user.role !== "super_admin"
  ) {
    return <Redirect to={finjoePathWithTenant(FINJOE_PATHS.peopleRoleRequests, tenantId, isSuperAdmin)} />;
  }

  const restricted =
    !canManageFinJoe &&
    (location.startsWith("/admin/finjoe/structure/") ||
      location.startsWith("/admin/finjoe/people/contacts") ||
      location.startsWith("/admin/finjoe/people/users") ||
      location.startsWith("/admin/finjoe/integrations/"));

  if (restricted) {
    return <Redirect to={finjoePathWithTenant(FINJOE_PATHS.peopleRoleRequests, tenantId, isSuperAdmin)} />;
  }

  const checklistTab = finjoePathToChecklistTab(location);

  const navLink = (path: string, label: string, icon: React.ReactNode) => {
    const active = pathOnly === path;
    return (
      <Link
        href={href(path)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors shrink-0",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title="Manage your organization's Finance Joe"
        description="Structure, people, and channel settings for WhatsApp and templates"
      />
      <OnboardingChecklist
        tenantId={tenantId}
        currentTab={checklistTab}
        onNavigateToTab={(tab) => {
          const map: Record<string, string> = {
            "cost-centers": FINJOE_PATHS.structureCostCenters,
            contacts: FINJOE_PATHS.peopleContacts,
            settings: FINJOE_PATHS.integrationsSettings,
            "role-requests": FINJOE_PATHS.peopleRoleRequests,
            team: FINJOE_PATHS.peopleUsers,
          };
          const p = map[tab];
          if (p) setLocation(finjoePathWithTenant(p, tenantId, isSuperAdmin));
        }}
      />
      <nav
        className="mt-6 flex w-full flex-wrap gap-2 border-b border-border pb-4"
        aria-label="FinJoe sections"
      >
        {canManageFinJoe && navLink(FINJOE_PATHS.structureCostCenters, "Cost centers", <Building2 className="h-4 w-4" />)}
        {canManageFinJoe && navLink(FINJOE_PATHS.peopleContacts, "Contacts", <MessageCircle className="h-4 w-4" />)}
        {canManageFinJoe &&
          navLink(FINJOE_PATHS.peopleUsers, "Dashboard users", <Users className="h-4 w-4" />)}
        {navLink(FINJOE_PATHS.peopleRoleRequests, "Role requests", <UserPlus className="h-4 w-4" />)}
        {canManageFinJoe &&
          navLink(FINJOE_PATHS.integrationsSettings, "Settings", <Settings className="h-4 w-4" />)}
      </nav>

      <div className="mt-6">
        <Switch>
          <Route path="/admin/finjoe/structure/cost-centers">
            <AdminCostCenters tenantId={tenantId} />
          </Route>
          <Route path="/admin/finjoe/people/contacts">
            <AdminFinJoeContacts tenantId={tenantId} />
          </Route>
          <Route path="/admin/finjoe/people/users">
            <AdminTeam embedded />
          </Route>
          <Route path="/admin/finjoe/people/role-requests">
            <AdminFinJoeRoleRequests tenantId={tenantId} />
          </Route>
          <Route path="/admin/finjoe/integrations/settings">
            <AdminFinJoeSettings tenantId={tenantId} />
          </Route>
          <Route>
            <Redirect to={finjoePathWithTenant(FINJOE_PATHS.structureCostCenters, tenantId, isSuperAdmin)} />
          </Route>
        </Switch>
      </div>
    </>
  );
}
