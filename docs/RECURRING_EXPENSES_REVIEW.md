# Recurring Expenses & Bot Gaps – Bug Review & Edge Cases

## Fixes Applied

### 1. updateRecurringTemplate nextRunDate bug (fixed)
**Issue:** When updating a template (e.g. amount), `nextRunDate` was recomputed from `startDate`, which could set it to a past date and cause duplicate expense generation.

**Fix:** Only recompute `nextRunDate` when `frequency`, `dayOfMonth`, or `dayOfWeek` changes. Use `today` as the from-date so the next run is from now, not from the original start.

### 2. Duplicate expense prevention (fixed)
**Issue:** If the cron ran twice (retry, manual + cron), the same template could generate duplicate expenses for the same date.

**Fix:** Before creating an expense, check if one already exists for `recurring_template_id` + `expense_date`. If so, advance `nextRunDate` and skip creation.

### 3. create_recurring_template validation (fixed)
**Issue:** No check for empty expense categories; invalid `startDate` produced a generic error.

**Fix:** Added validation for `validCategoryIds.length === 0` and `startDate` format (YYYY-MM-DD).

---

## Edge Cases & Gaps (Documented)

### Date / schedule logic
| Case | Handling |
|------|----------|
| dayOfMonth 31 in February | `Math.min(dom, lastDay)` → Feb 28 |
| dayOfMonth 31 in April | Apr 30 |
| Weekly, same day as fromDate | Returns that day (first occurrence) |
| startDate in future | `computeNextRunDate` returns first occurrence on/after startDate |
| endDate = today | Still runs (end >= today) |
| endDate = yesterday | Filtered out |

### Cron & concurrency
| Case | Handling |
|------|----------|
| Cron runs twice same day | Duplicate check prevents second expense; advances nextRunDate |
| Cron misses a day | Template stays due; next run processes all missed dates one-by-one (each run advances nextRunDate) |
| Worker down during cron | run-all-cron exits with error; no retry (operator can re-run manually) |

### Data integrity
| Case | Handling |
|------|----------|
| Category deleted after template created | FK violation on expense create; error logged, template continues |
| Cost center deleted | Same |
| Template deleted while cron running | Possible FK issue on expense; template row gone |

### Bot / agent
| Case | Handling |
|------|----------|
| create_recurring_template with no categories | Returns clear error |
| update with no fields | Returns "No fields to update" |
| delete non-existent template | Returns "Could not delete" |
| list_recurring_templates with isActive filter | Works |

### parseExpenseQuery / date fix
| Case | Handling |
|------|----------|
| "last month" with today injected | Correct range (e.g. Feb 1–28 for March 12) |
| Gemini returns invalid JSON | Returns null; semantic_search returns parse failure message |
| Empty cost centers | campusList = "None" |

---

## Remaining Gaps (Lower Priority)

1. **Category/cost center deletion** – No cascade or soft-delete; templates can reference deleted entities. Consider: validate before create, or add ON DELETE SET NULL for cost_center_id.

2. **Timezone** – All dates use server UTC. For tenant-specific timezones, would need tenant config.

3. **Catch-up for missed runs** – If cron is down for a week, a weekly template runs once and advances; it does not create 7 expenses. This is by design (one run per template per cron execution).

4. **run-all-cron non-JSON response** – If the worker returns HTML (e.g. 502), `res.json()` throws. Consider `res.text()` and check content-type.

5. **update_recurring_template tenant isolation** – Uses `tenantId` from `createFinJoeData`; no cross-tenant update possible. Correct.
