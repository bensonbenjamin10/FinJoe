# Income tracking — ops and support

## Product scope (cash vs accounts receivable)

FinJoe treats **income as posted cash-style ledger lines** in `income_records`: amount, date, category, optional cost center, and provenance (`source`). MIS and analytics read this table directly.

**In scope today:** recording money in (manual, WhatsApp, bank import, recurring templates, verified Razorpay payments), categorizing for MIS, and reconciling to bank where applicable.

**Out of scope unless you extend the product:** full **accounts receivable** (invoices, customer sub-ledgers, aging, payment applications to open invoices, credit notes, revenue recognition schedules). If you need “who owes what before cash arrives,” plan new entities (e.g. invoices / fee schedules) and link settlements to `income_records` rather than overloading the current model.

---

## `income_records.source` values

Use this table when investigating duplicates, reconciliation gaps, or training staff.

| `source` value | Meaning | Typical ingress |
|----------------|---------|-----------------|
| `manual` | Entered in admin | Admin UI → `POST /api/admin/income` |
| `finjoe` | Conversational capture | WhatsApp FinJoe agent (`create_income` / `confirm_income`) |
| `bank_import` | From statement CSV | Admin expense import pipeline (credit rows) |
| `recurring_template` | Scheduled accrual-style line | Cron `generateIncomeFromTemplates` / `/cron/recurring-income` |
| `razorpay` | Online payment verified | `POST /api/payments/verify` after Razorpay checkout |
| `invoice_payment` | Payment allocated to invoice | Manual or gateway payment via invoicing module |

**Notes**

- Bank import creates matching `bank_transactions` rows and sets `income_records.bank_transaction_id` immediately for those lines.
- Razorpay rows are **idempotent** on `income_records.razorpay_payment_id` (one ledger line per Razorpay payment id). Replaying verify is safe.
- Invoice payments: `payment_allocations` links each capture to an `invoices` row. The allocation service calls `createIncome` with `source: "invoice_payment"` and sets `particulars` to include the invoice number. The `invoices.amount_paid` column is derived from `sum(payment_allocations.amount)` to avoid dual sources of truth.

---

## Razorpay environment

- `RAZORPAY_KEY_ID` — publishable key id (returned to the client for checkout).
- `RAZORPAY_KEY_SECRET` — server-only; used to create orders, fetch payments, and verify signatures.

If these are unset, `/api/payments/create-order` and related endpoints respond with **503** and a clear error.

**Create order (authenticated):** `POST /api/payments/create-order` — requires a tenant context (tenant user or `super_admin` with `tenantId` in body or `?tenantId=`). Resolves income category from optional `incomeCategoryId` or the first active category for the tenant.

**Public checkout:** `GET /api/payments/order/:razorpayOrderId` — returns `keyId`, `amount` (rupees), `currency`, `orderId` for the existing client checkout page.

**Verify:** `POST /api/payments/verify` — validates signature, confirms amount with Razorpay, then inserts `income_records` with `source: "razorpay"` unless already present.

---

## Related code

- Schema: [`shared/schema.ts`](../../shared/schema.ts) — `income_records`, `payment_orders`, `billing_customers`, `invoices`, `invoice_lines`, `payment_allocations`
- Routes: [`server/payments-routes.ts`](../../server/payments-routes.ts), [`server/razorpay-api.ts`](../../server/razorpay-api.ts), [`server/invoicing-routes.ts`](../../server/invoicing-routes.ts)
- Shared writes: [`lib/finjoe-data.ts`](../../lib/finjoe-data.ts) — `createIncome`
- Invoicing services: [`lib/invoicing/application/invoice-service.ts`](../../lib/invoicing/application/invoice-service.ts), [`lib/invoicing/application/payment-allocation-service.ts`](../../lib/invoicing/application/payment-allocation-service.ts)
- Ports: [`lib/invoicing/ports/`](../../lib/invoicing/ports/) — `TaxCalculationPort`, `InvoiceDocumentPort`, `PaymentCapturePort`
