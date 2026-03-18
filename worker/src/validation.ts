/**
 * Validation before DB commit - never update DB until data passes validation.
 */

export type ValidationResult = { valid: boolean; errors: string[] };

export type NamedItem = { id: string; name: string };

export type ExpenseData = {
  amount?: number;
  expenseDate?: string;
  categoryId?: string;
  campusId?: string | null;
  costCenterId?: string | null;
  description?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  vendorName?: string | null;
  gstin?: string | null;
  taxType?: string | null;
};

const VALID_TAX_TYPES = ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"];

const TAX_TYPE_LABELS: Record<string, string> = {
  no_gst: "No GST (unregistered vendor)",
  gst_itc: "GST with Input Tax Credit",
  gst_rcm: "GST Reverse Charge",
  gst_no_itc: "GST without ITC",
};

/** Validate expense data before creating/updating in DB */
export function validateExpenseData(
  data: ExpenseData,
  validCategories: string[] | NamedItem[],
  validCampuses: string[] | NamedItem[],
  requireAuditFieldsAboveAmount?: number | null
): ValidationResult {
  const errors: string[] = [];
  const categoryIds = validCategories.map((c) => typeof c === "string" ? c : c.id);
  const campusIds = validCampuses.map((c) => typeof c === "string" ? c : c.id);

  if (!data.amount || data.amount <= 0) {
    errors.push("Amount must be greater than 0");
  }
  if (!data.expenseDate) {
    errors.push("Expense date is required");
  }
  if (!data.categoryId) {
    errors.push("Expense category is required");
  } else if (categoryIds.length > 0 && !categoryIds.includes(data.categoryId)) {
    const display = validCategories.map((c) => typeof c === "string" ? c : c.name).join(", ");
    errors.push(`Invalid category. Valid options: ${display}`);
  }
  if (data.campusId && data.campusId !== "__corporate__" && campusIds.length > 0 && !campusIds.includes(data.campusId)) {
    const display = validCampuses.map((c) => typeof c === "string" ? c : c.name).join(", ");
    errors.push(`Invalid cost center. Valid options: ${display}`);
  }
  if (data.gstin && data.gstin.length !== 15) {
    errors.push("GSTIN must be 15 characters if provided");
  }
  if (data.taxType && !VALID_TAX_TYPES.includes(data.taxType)) {
    const labels = VALID_TAX_TYPES.map((t) => `${t} (${TAX_TYPE_LABELS[t]})`).join(", ");
    errors.push(`Tax type must be one of: ${labels}`);
  }

  if (
    requireAuditFieldsAboveAmount != null &&
    requireAuditFieldsAboveAmount > 0 &&
    data.amount != null &&
    data.amount >= requireAuditFieldsAboveAmount
  ) {
    const missingAuditFields: string[] = [];
    if (!data.invoiceNumber?.trim()) missingAuditFields.push("invoice number");
    if (!data.invoiceDate?.trim()) missingAuditFields.push("invoice date");
    if (!data.vendorName?.trim()) missingAuditFields.push("vendor name");
    if (missingAuditFields.length > 0) {
      errors.push(`For expenses above ₹${requireAuditFieldsAboveAmount.toLocaleString("en-IN")}, ${missingAuditFields.join(", ")} ${missingAuditFields.length === 1 ? "is" : "are"} required`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export type RoleChangeData = {
  contactPhone: string;
  requestedRole: string;
  name?: string | null;
  campusId?: string | null;
  studentId?: string | null;
};

const VALID_ROLES = ["vendor", "faculty", "student"];

/** Validate role change request data before creating in DB */
export function validateRoleChangeData(
  data: RoleChangeData,
  validCampuses: string[] | NamedItem[]
): ValidationResult {
  const errors: string[] = [];
  const campusIds = validCampuses.map((c) => typeof c === "string" ? c : c.id);

  if (!data.contactPhone || data.contactPhone.trim().length === 0) {
    errors.push("Contact phone is required");
  }
  if (!data.requestedRole) {
    errors.push("Requested role is required");
  } else if (!VALID_ROLES.includes(data.requestedRole)) {
    errors.push(`Requested role must be one of: ${VALID_ROLES.join(", ")}`);
  }
  if (!data.name || data.name.trim().length === 0) {
    errors.push("Name is required");
  }
  if (["vendor", "faculty"].includes(data.requestedRole) && !data.campusId) {
    errors.push("Campus is required for vendor and faculty roles");
  } else if (data.campusId && campusIds.length > 0 && !campusIds.includes(data.campusId)) {
    const display = validCampuses.map((c) => typeof c === "string" ? c : c.name).join(", ");
    errors.push(`Invalid cost center. Valid options: ${display}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
