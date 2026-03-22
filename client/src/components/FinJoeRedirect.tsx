import { Redirect, useSearchParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { FINJOE_PATHS, tenantQuerySuffix } from "@/lib/finjoe-routes";

/**
 * `/admin/finjoe` → default FinJoe page (cost centers for admins, role requests for other tenant staff).
 */
export function FinJoeRootRedirect() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const urlTenantId = searchParams.get("tenantId");
  const isSuperAdmin = user?.role === "super_admin";
  const tenantId = isSuperAdmin ? (urlTenantId || user?.tenantId || null) : user?.tenantId ?? null;
  const qs = tenantQuerySuffix(tenantId, isSuperAdmin);
  const canManageFinJoe = user?.role === "admin" || user?.role === "super_admin";
  const target = canManageFinJoe
    ? `${FINJOE_PATHS.structureCostCenters}${qs}`
    : `${FINJOE_PATHS.peopleRoleRequests}${qs}`;
  return <Redirect to={target} />;
}

/** `/admin/team` → FinJoe dashboard users */
export function LegacyTeamRedirect() {
  const [searchParams] = useSearchParams();
  const tid = searchParams.get("tenantId");
  const qs = tid ? `?tenantId=${encodeURIComponent(tid)}` : "";
  return <Redirect to={`${FINJOE_PATHS.peopleUsers}${qs}`} />;
}
