# Financial Data Collection and Confirmation (Option C - Configurable)

## Overview

Implemented tenant-configurable data collection and confirmation settings. Admins can tune behavior per organization without code changes.

## Implemented Changes

### 1. Schema and Migration

- **Migration** [`migrations/023_data_collection_settings.sql`](migrations/023_data_collection_settings.sql): Added 3 columns to `finjoe_settings`:
  - `require_confirmation_before_post` (boolean, default false)
  - `require_audit_fields_above_amount` (integer, nullable)
  - `ask_optional_fields` (boolean, default false)

### 2. Backend

- **lib/finjoe-data.ts**: Extended `FinJoeSettings` type and `getFinJoeSettings()` to return new fields
- **server/routes.ts**: GET and PATCH `/api/admin/finjoe/settings` now handle the new fields
- **worker/src/validation.ts**: `validateExpenseData()` accepts optional `requireAuditFieldsAboveAmount`; when amount >= threshold, enforces invoiceNumber, invoiceDate, vendorName
- **worker/src/context.ts**: `fetchSystemContext()` returns `dataCollectionSettings`; injects prompt instructions when settings are enabled
- **worker/src/agent/agent.ts**:
  - Added `confirm_expense` and `confirm_income` tools for confirmation flow
  - When `requireConfirmationBeforePost` is true: `create_expense`/`create_income` store data in `pendingConfirmation` and return a message asking the user to confirm; user says "yes" → agent calls `confirm_expense`/`confirm_income` → expense/income is created
  - Passes `requireAuditFieldsAboveAmount` to validation
- **worker/src/agent/gemini.ts**: Added `confirm_expense` and `confirm_income` function declarations to BASE_TOOLS

### 3. Admin UI

- **client/src/pages/admin-finjoe-settings.tsx**: New "Data Collection & Confirmation" card with:
  - Toggle: Require confirmation before posting
  - Input: Require audit fields above amount (₹)
  - Toggle: Ask for optional fields (GSTIN, tax type)
- **client/src/pages/admin-expenses.tsx**: When `requireConfirmationBeforePost` is true, shows confirmation dialog before creating expense
- **client/src/pages/admin-income.tsx**: Same confirmation dialog for income creation

## Defaults

- `requireConfirmationBeforePost`: false (no change to current behavior)
- `requireAuditFieldsAboveAmount`: null (never enforce)
- `askOptionalFields`: false

## Run Migration

```bash
# If using psql:
psql $DATABASE_URL -f migrations/023_data_collection_settings.sql

# Or use the project's migrate script if it includes this migration:
npm run db:migrate
```

## Flow When Confirmation Is Enabled

1. User provides expense/income data (e.g. via WhatsApp or admin form)
2. Agent/form has all required data
3. **WhatsApp**: Agent calls `create_expense` → system stores in `pendingConfirmation` and returns "Ask user to confirm" → Agent asks "I'll record: ₹X for Chennai. Reply yes to confirm." → User says "yes" → Agent calls `confirm_expense` → Expense is created
4. **Admin UI**: User clicks "Create" → Confirmation dialog appears with summary → User clicks "Confirm" → Expense/income is created
