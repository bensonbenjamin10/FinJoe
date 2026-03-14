# Bugs, Gaps, and Edge Cases – Review

Review of the recurring expense/template and related flows after the 1970 fix and GST/vendor autocomplete implementation.

---

## 1. Bugs / Gaps (Pre-existing, from BUG_REVIEW.md)

| Issue | Location | Status |
|-------|----------|--------|
| Backfill: embedExpenseText null not counted | `lib/backfill-embeddings.ts` | **Fixed** – `errors++` when embedding is null (line 107) |
| run-all-cron: 200 with non-JSON as success | `scripts/run-all-cron.mjs` | **Fixed** – `!res.ok \|\| data.error` triggers error branch |

---

## 2. Recurring / Cron – Edge Cases Not Solved

### 2.1 `advanceRecurringNextRun` with invalid date string

**Status:** **Fixed** – Added `if (isNaN(d.getTime())) return null` guard at start of `advanceRecurringNextRun`.

---

### 2.2 `listDistinctVendorNames` – no limit, full table scan

**Status:** **Fixed** – Now uses `selectDistinct` with `ORDER BY vendor_name LIMIT 100`.

---

### 2.3 WhatsApp `create_recurring_template` – no GST fields

**Status:** **Fixed** – Added optional `gstin`, `taxType`, `invoiceNumber`, `voucherNumber` to tool schema and agent handler.

---

### 2.4 WhatsApp `update_recurring_template` – no GST fields

**Status:** **Fixed** – Added optional GST params to tool and agent handler.

---

### 2.5 `create_recurring_template` rejection – generic error

**Status:** **Fixed** – Returns `{ error: "startDate must be 2022 or later..." }`; API returns 400 with message; agent surfaces it to user.

---

### 2.6 Expense create failure – `nextRunDate` not advanced

**Location:** `lib/finjoe-data.ts` line 1355

**Issue:** If `createExpense` returns `null` (e.g. transient DB error), we do not advance `nextRunStr`. The template’s `nextRunDate` is only updated at the end of the loop. So we may retry the same date on the next cron run.

**Impact:** Low – duplicate check prevents double creation. Worst case: one missed expense until manual fix.

**Recommendation:** Consider advancing `nextRunStr` even when create fails, or logging more detail for debugging.

---

## 3. Vendor Autocomplete – Edge Cases

### 3.1 Empty vendor suggestions for new tenants

**Issue:** New tenants have no expenses, so `vendorSuggestions` is empty. Datalist shows no options but free text still works.

**Status:** Acceptable – no change needed.

---

### 3.2 Datalist ID collision when multiple dialogs

**Issue:** Create and Edit dialogs use different IDs (`vendor-suggestions-create`, `vendor-suggestions-edit`). No collision.

**Status:** OK.

---

## 4. Recurring Template Form – Edge Cases

### 4.1 GSTIN validation

**Status:** **Fixed** – Create/Edit forms validate GSTIN format (15 alphanumeric chars) before submit; blocks invalid values.

---

### 4.2 Tax type vs GSTIN consistency

**Status:** **Fixed** – Create form shows a note when GST tax type is selected but GSTIN is empty.

---

## 5. Other Gaps (Lower Priority)

| Gap | Impact |
|-----|--------|
| Timezone | All dates UTC; no tenant-specific TZ |
| Recurring income GST | Income templates have no GST fields (different domain) |
| Invoice number pattern | No support for patterns like `RENT-{month}`; user must enter static value |
| Cost center `__corporate__` | Stored as null in DB; display logic handles it |

---

## 6. Summary – Recommended Fixes

| Priority | Item | Status |
|----------|------|--------|
| Medium | Add `advanceRecurringNextRun` invalid-date guard | Done |
| Medium | Add limit to `listDistinctVendorNames` | Done |
| Low | WhatsApp: add GST params to create/update_recurring_template | Done |
| Low | Better error when startDate yields far-past nextRunDate | Done |
| Low | Optional GSTIN format validation in form | Done |
