# FinJoe tenant RBAC matrix

Roles: `super_admin` (platform), `admin` (tenant org admin), `finance`, `campus_coordinator`, `head_office`.

| Middleware | Roles allowed |
|------------|----------------|
| `requireTenantAdmin` | `admin`, `super_admin` |
| `requireTenantStaff` | `admin`, `finance`, `campus_coordinator`, `head_office`, `super_admin` |
| `requireApprover` | `admin`, `finance`, `super_admin` |

## Route groups (summary)

- **Tenant staff** (`requireTenantStaff`): read cost centers; list users (summary); role-request list; conversations, media, message search; FinJoe settings **GET**, template statuses, WhatsApp provider **GET**; income categories/types **GET**; income CRUD; reconciliation; analytics; MIS; expense categories **GET**; recurring templates **GET**; expense list/export/create/patch/submit; import preview/analyze/template/vendor suggestions.
- **Approver** (`requireApprover`): role-request approve/reject; expense import **execute**; expense approve/reject/payout.
- **Tenant admin** (`requireAdmin` / `requireTenantAdmin`): cost center CUD; FinJoe contacts CUD; FinJoe settings **PATCH**; Twilio/template tests and WABA **PUT**; income category/type CUD + seeds; expense category CUD + seeds; recurring templates CUD; cron trigger/history; expense **DELETE**; tenant user management + invites.

Constants live in [`server/auth.ts`](../server/auth.ts).
