# Admin IA implementation (beta rollout) — executed

## Goals

- Post-login (and setup) land on **Dashboard**, not FinJoe.
- FinJoe uses **path-based** nested URLs aligned with [admin-ia-strategy.md](../admin-ia-strategy.md).
- **Team** (dashboard users) lives under **FinJoe → People → Dashboard users**; remove duplicate top-level Team nav.
- **Backwards compatibility**: `/admin/finjoe` and `/admin/team` redirect with `tenantId` preserved.

## Canonical routes

| Path | Content |
|------|---------|
| `/admin/finjoe/structure/cost-centers` | Cost centers |
| `/admin/finjoe/people/contacts` | WhatsApp contacts |
| `/admin/finjoe/people/users` | Dashboard users (Team); `admin` + `super_admin` only |
| `/admin/finjoe/people/role-requests` | Role requests (all tenant staff) |
| `/admin/finjoe/integrations/settings` | WhatsApp / template settings |

Redirects:

- `/admin/finjoe` → `/admin/finjoe/structure/cost-centers` (+ query)
- `/admin/team` → `/admin/finjoe/people/users` (+ query)

## Access control

- Non–tenant-admin staff (`finance`, coordinators, etc.) may only use **role-requests**; layout redirects other FinJoe paths to `people/role-requests`.
- **Dashboard users** route keeps `requireRoles: ["admin", "super_admin"]`.

## Files touched (reference)

- `client/src/lib/finjoe-routes.ts` — path constants, `tenantQuerySuffix` / `finjoePathWithTenant`, **`FINJOE_AREA_PATH_PATTERN`** (one wouter `Route` for all `/admin/finjoe…` so the hub does not remount on sub-nav)
- `client/src/components/FinJoeRedirect.tsx` — `FinJoeRootRedirect`, `LegacyTeamRedirect` (preserve `tenantId`)
- `client/src/pages/admin-finjoe-hub.tsx` — FinJoe chrome, guards, inner `Switch`, embeds `AdminTeam` with `embedded`
- Removed `client/src/pages/admin-finjoe.tsx` (replaced by hub)
- `client/src/App.tsx` — regex FinJoe route; `/admin/team` → redirect only
- `client/src/components/layout/PageHeader.tsx` — `description` accepts `ReactNode` (links in headers)
- `client/src/components/layout/AdminShell.tsx` — FinJoe link + active state; **Team** sidebar entry deep-links to `FINJOE_PATHS.peopleUsers` (not `?tab=`)
- `client/src/pages/login.tsx`, `setup.tsx` — dashboard redirect
- `client/src/components/OnboardingChecklist.tsx` — tab → path navigation
- `client/src/pages/admin-team.tsx` — `embedded` layout option
- Links: `admin-tenants`, `admin-income`, `navigation`, `AdminLayout`, `admin-finjoe-contacts`
- `docs/admin-ia-strategy.md` — note implementation complete / routes live

## Milestone checklist

See [milestones-admin-ia.md](../milestones-admin-ia.md) for a full verify-after-deploy list.

## Verification

- Login → `/admin/dashboard`
- FinJoe sidebar opens cost-centers; sub-nav switches pages; URL updates
- `/admin/team` and `/admin/finjoe` redirect correctly with `?tenantId=`
- Coordinator/finance: only role-requests path works; others redirect
- `npm run build` passes
