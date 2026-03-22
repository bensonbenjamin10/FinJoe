# Admin IA & FinJoe — milestone checklist

Use this to verify the full system after deploy or major refactors.

## Landing & auth

- [x] Login success → `/admin/dashboard`
- [x] Setup complete → `/admin/dashboard`
- [x] Signup auto-login → `/admin/dashboard`
- [x] Accept invite success → `/admin/dashboard` (when login succeeds)
- [x] `/admin` → `/admin/dashboard` redirect

## FinJoe routing (scalable paths)

- [x] Nested URLs under `/admin/finjoe/...` (structure / people / integrations)
- [x] One outer `Route` via `FINJOE_AREA_PATH_PATTERN` + inner `Switch` in `admin-finjoe-hub.tsx`
- [x] `/admin/finjoe` → role-appropriate default (`FinJoeRootRedirect`)
- [x] `/admin/team` → `/admin/finjoe/people/users` + query (`LegacyTeamRedirect`)
- [x] Non-manager tenant staff blocked from structure/contacts/users/settings → role requests

## Navigation & cross-links

- [x] Sidebar **FinJoe** + **Team** (tenant admin) with correct `tenantId` for super_admin
- [x] Contacts helper text links to **Dashboard users**
- [x] Team page links back to **Contacts**
- [x] Super admin “Open FinJoe” from tenants → cost centers + `tenantId`

## Onboarding

- [x] Checklist “Go” steps navigate via path-based routes (`onNavigateToTab`)
- [x] Optional step: staff dashboard users (finance / coordinators) → **Team** tab

## Database & migrations

- [x] `db:migrate` reads `drizzle.__drizzle_migrations` (not `public`)
- [x] Journal `when` monotonic for Drizzle migrator (`0007` after `0006`)
- [x] `db:repair-invite-columns` for emergency `invite_token_*` DDL
- [x] `run-migrations.mjs` normalizes Railway `DATABASE_URL` (`sslmode=disable`) like `db-query`

## Build

- [x] `npm run build` passes
- [x] `npm test` passes

---

*Last reviewed: maintain when adding new FinJoe sections or admin entry points.*
