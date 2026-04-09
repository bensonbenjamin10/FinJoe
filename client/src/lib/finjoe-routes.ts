/** Canonical FinJoe (organization) admin paths — see docs/admin-ia-strategy.md */

/** One wouter Route for all FinJoe pages (avoids remounting the hub on sub-nav). */
export const FINJOE_AREA_PATH_PATTERN = /^\/admin\/finjoe(\/.*)?$/;

export const FINJOE_PATHS = {
  structureCostCenters: "/admin/finjoe/structure/cost-centers",
  peopleContacts: "/admin/finjoe/people/contacts",
  peopleUsers: "/admin/finjoe/people/users",
  peopleRoleRequests: "/admin/finjoe/people/role-requests",
  integrationsSettings: "/admin/finjoe/integrations/settings",
  integrationsExports: "/admin/finjoe/integrations/exports",
  approvalRules: "/admin/finjoe/approvals/rules",
} as const;

/** Onboarding / checklist tab ids → path (no query). */
export const FINJOE_TAB_TO_PATH: Record<string, string> = {
  "cost-centers": FINJOE_PATHS.structureCostCenters,
  contacts: FINJOE_PATHS.peopleContacts,
  settings: FINJOE_PATHS.integrationsSettings,
  "role-requests": FINJOE_PATHS.peopleRoleRequests,
  team: FINJOE_PATHS.peopleUsers,
};

export function tenantQuerySuffix(tenantId: string | null, isSuperAdmin: boolean): string {
  if (isSuperAdmin && tenantId) {
    return `?tenantId=${encodeURIComponent(tenantId)}`;
  }
  return "";
}

export function finjoePathWithTenant(
  path: string,
  tenantId: string | null,
  isSuperAdmin: boolean
): string {
  return `${path}${tenantQuerySuffix(tenantId, isSuperAdmin)}`;
}

/** Map current location to onboarding tab id. */
export function finjoePathToChecklistTab(pathname: string): string {
  if (pathname.includes("/structure/cost-centers")) return "cost-centers";
  if (pathname.includes("/people/contacts")) return "contacts";
  if (pathname.includes("/people/users")) return "team";
  if (pathname.includes("/people/role-requests")) return "role-requests";
  if (pathname.includes("/integrations/settings")) return "settings";
  if (pathname.includes("/integrations/exports")) return "settings";
  return "cost-centers";
}
