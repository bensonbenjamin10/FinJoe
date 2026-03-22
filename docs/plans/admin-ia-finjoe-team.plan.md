# Admin landing + FinJoe / Team — **reconciled plan (scalable system)**

This document **supersedes** the earlier Cursor plan that used **`/admin/finjoe?tab=…`** query params. That approach conflicted with the **path-based** FinJoe IA we ship for scale (bookmarkable URLs, clear hierarchy, one stable hub).

**Do not switch back to `?tab=`** unless you intentionally drop nested paths; the running app uses the layout below.

## Resolved decisions

| Earlier plan | Scalable system (current) |
|--------------|---------------------------|
| `?tab=team` + `admin-finjoe.tsx` tabs only | Nested paths under `/admin/finjoe/...` + [`admin-finjoe-hub.tsx`](../../client/src/pages/admin-finjoe-hub.tsx) (single wouter route via [`FINJOE_AREA_PATH_PATTERN`](../../client/src/lib/finjoe-routes.ts) so the hub does not remount) |
| Sidebar “Team” → `?tab=team` | Sidebar **Team** → **`/admin/finjoe/people/users`** + `tenantId` when super_admin (same UX intent, stable URL) |
| `/admin/team` redirect | Still supported → **`/admin/finjoe/people/users`** ([`LegacyTeamRedirect`](../../client/src/components/FinJoeRedirect.tsx)) |

## Mental model (unchanged)

- **`/admin/dashboard`** — default after login / setup.
- **`/admin/finjoe/...`** — organization + channel setup: structure, people (contacts, dashboard users, role requests), integrations (settings).

## Canonical URLs

See [admin-ia-implementation.plan.md](admin-ia-implementation.plan.md) and [admin-ia-strategy.md](../admin-ia-strategy.md).

## Implementation reference

- [`client/src/lib/finjoe-routes.ts`](../../client/src/lib/finjoe-routes.ts) — paths + helpers  
- [`client/src/pages/admin-finjoe-hub.tsx`](../../client/src/pages/admin-finjoe-hub.tsx) — FinJoe chrome + inner routes  
- [`client/src/components/layout/AdminShell.tsx`](../../client/src/components/layout/AdminShell.tsx) — FinJoe + **Team** deep-link  

## Testing

- Login → dashboard.  
- Sidebar **Team** (tenant admin) → dashboard users page.  
- `/admin/team` → same.  
- Super admin: `tenantId` preserved on FinJoe and Team links.
