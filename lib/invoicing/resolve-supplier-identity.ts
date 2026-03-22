export type SupplierGstinSource = "invoice_override" | "cost_center" | "tenant" | null;

export function gstinToStateCode(gstin: string | null | undefined): string | undefined {
  if (!gstin || gstin.length < 2) return undefined;
  return gstin.slice(0, 2);
}

function pickState(gstin: string, explicit: string | undefined): string | undefined {
  if (explicit && /^\d{2}$/.test(explicit)) return explicit;
  return gstinToStateCode(gstin) || undefined;
}

export type TenantTaxConfig = Record<string, unknown> | null | undefined;

export type CostCenterBilling = {
  billingGstin?: string | null;
  billingStateCode?: string | null;
} | null;

/** User override on a draft invoice (merged from request + existing ext). */
export type InvoiceOverrideInput = {
  supplierGstin?: string;
  supplierStateCode?: string;
};

/**
 * Resolution order: invoice override (GSTIN and/or state) → cost center billing → tenant tax_regime_config.
 */
export function resolveSupplierIdentity(params: {
  tenantConfig: TenantTaxConfig;
  costCenter: CostCenterBilling;
  invoiceOverride?: InvoiceOverrideInput | null;
}): { supplierGstin: string; supplierStateCode: string | undefined; source: SupplierGstinSource } {
  const t = params.tenantConfig ?? {};
  const tenantGstin = String(t.supplierGstin ?? "").trim().toUpperCase();
  const tenantStateRaw = String(t.supplierStateCode ?? "").trim();

  const cc = params.costCenter;
  const ccGstin = (cc?.billingGstin ?? "").trim().toUpperCase();
  const ccStateRaw = (cc?.billingStateCode ?? "").trim();

  const ov = params.invoiceOverride;
  const ovGstin = (ov?.supplierGstin ?? "").trim().toUpperCase();
  const ovStateRaw = (ov?.supplierStateCode ?? "").trim();

  if (ovGstin) {
    return {
      supplierGstin: ovGstin,
      supplierStateCode: pickState(ovGstin, ovStateRaw || undefined),
      source: "invoice_override",
    };
  }

  if (ovStateRaw && /^\d{2}$/.test(ovStateRaw)) {
    if (ccGstin) {
      return { supplierGstin: ccGstin, supplierStateCode: ovStateRaw, source: "invoice_override" };
    }
    if (tenantGstin) {
      return { supplierGstin: tenantGstin, supplierStateCode: ovStateRaw, source: "invoice_override" };
    }
    return { supplierGstin: "", supplierStateCode: ovStateRaw, source: "invoice_override" };
  }

  if (ccGstin) {
    return {
      supplierGstin: ccGstin,
      supplierStateCode: pickState(ccGstin, ccStateRaw || undefined),
      source: "cost_center",
    };
  }

  if (tenantGstin || (tenantStateRaw && /^\d{2}$/.test(tenantStateRaw))) {
    return {
      supplierGstin: tenantGstin,
      supplierStateCode: pickState(tenantGstin, tenantStateRaw || undefined),
      source: "tenant",
    };
  }

  return { supplierGstin: "", supplierStateCode: undefined, source: null };
}
