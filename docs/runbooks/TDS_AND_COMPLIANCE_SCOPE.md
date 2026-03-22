# TDS and broader compliance — product scope (future)

FinJoe today classifies **TDS remittance** only as an expense/MIS category (e.g. “TDS Payment”) so cash outflows can be tagged in reports. It does **not** compute withholding, generate certificates, or file returns.

This document scopes what a full **TDS (India)** feature set would entail so engineering and finance can prioritize later.

## Current state (FinJoe)

- **Expenses**: GSTIN, tax type (ITC / RCM / etc.), invoice metadata; optional audit rules in FinJoe settings.
- **AR / invoicing**: Configurable tax regime (`flat_percent`, `gst_in`, reserved `vat_ae`), supplier GSTIN/state (tenant default plus optional per cost center billing GSTIN and per-draft invoice override), server-side tax engines, HTML tax invoice for India GST.
- **No**: TDS deduction on vendor payments, Form 16/16A, challan workflow, or return preparation.

## TDS — suggested domains

### 1. Master data

- **Sections** (e.g. 194C, 194J, 194I) with default rates, thresholds, and whether TCS/TDS applies to expense type.
- **Vendor PAN / TAN** and “deductee” type (company, individual, etc.).
- **Exemptions** / lower-deduction certificates (validity dates, rates).

### 2. Transaction flow (AP)

- On **vendor bill approval** or **payment**: compute TDS base (gross vs net definitions per section), apply rate and caps, produce **TDS line** (liability) separate from net payable to vendor.
- **Partial payments**: allocate TDS proportionally or per policy.
- **Reversals** and **debit notes**: adjust TDS liability and GL.

### 3. General ledger

- Chart mapping: TDS payable (balance sheet), expense accounts, and **clearing** on remittance.
- Period-end reconciliation: TDS liability vs TRACES / bank.

### 4. Deposits and compliance artifacts

- **Challan** generation (e.g. 281 linkage), due dates (monthly / quarterly by entity type).
- **Form 16A** / consolidated filing outputs where applicable (export for external tools if full e-filing is out of scope).

### 5. UI and APIs

- Admin: section setup, vendor tax profile, TDS summary by period, drill-down to vouchers.
- Optional: reminders before due dates; read-only **statement** for vendors.

### 6. Non-goals (unless explicitly chosen)

- Payroll TDS (salary) — different rules and often a separate module.
- Automatic **TRACES** or **e-filing** integration — high maintenance; many teams export and use government or partner portals.

## Recommended phasing

1. **Phase A — Visibility**: TDS amount as optional fields on expenses + reporting (no automatic rate engine).
2. **Phase B — Engine**: Section master + auto-calculation on expense/payment with GL postings.
3. **Phase C — Remittance**: Challan tracking, period close, export packages for compliance tools.

## India GST — supplier identity on invoices (multi-GSTIN)

For tenants using `gst_in`, the **effective supplier GSTIN and state** used in tax calculation and on the printed invoice are chosen in this order: (1) explicit fields on the draft invoice (“issue as” GSTIN / state override), (2) the invoice’s **cost center** billing GSTIN and optional billing state code when a cost center is set, (3) the tenant’s tax settings (organization default). On save, the resolved values are written to `invoices.ext` (including `supplierGstin`, `supplierGstinSource`, and override keys when applicable) so issued documents stay stable if master data changes later.

## Related code pointers

- Expense GST / tax type: `client/src/pages/admin-expenses.tsx`, `shared/schema.ts` (`expenses.gstin`, `taxType`).
- MIS categories: `server/seed-mis-categories.ts` (`tds_payment`, `opex_tds_payment`).
- Invoice tax: `lib/invoicing/ports/tax-regime-registry.ts`, `lib/invoicing/application/invoice-service.ts`, `lib/invoicing/resolve-supplier-identity.ts`.
