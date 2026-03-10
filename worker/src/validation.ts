/**
 * Validation before DB commit - never update DB until data passes validation.
 */

export type ValidationResult = { valid: boolean; errors: string[] };

export type ExpenseData = {
  amount?: number;
  expenseDate?: string;
  categoryId?: string;
  campusId?: string | null;
  description?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  vendorName?: string | null;
  gstin?: string | null;
  taxType?: string | null;
};

const VALID_TAX_TYPES = ["no_gst", "gst_itc", "gst_rcm", "gst_no_itc"];

/** Validate expense data before creating/updating in DB */
export function validateExpenseData(
  data: ExpenseData,
  validCategoryIds: string[],
  validCampusIds: string[]
): ValidationResult {
  const errors: string[] = [];

  if (!data.amount || data.amount <= 0) {
    errors.push("Amount must be greater than 0");
  }
  if (!data.expenseDate) {
    errors.push("Expense date is required");
  }
  if (!data.categoryId) {
    errors.push("Expense category is required");
  } else if (validCategoryIds.length > 0 && !validCategoryIds.includes(data.categoryId)) {
    errors.push(`Invalid category. Valid: ${validCategoryIds.join(", ")}`);
  }
  if (data.campusId && data.campusId !== "__corporate__" && validCampusIds.length > 0 && !validCampusIds.includes(data.campusId)) {
    errors.push(`Invalid campus. Valid: ${validCampusIds.join(", ")}`);
  }
  if (data.gstin && data.gstin.length !== 15) {
    errors.push("GSTIN must be 15 characters if provided");
  }
  if (data.taxType && !VALID_TAX_TYPES.includes(data.taxType)) {
    errors.push(`Tax type must be one of: ${VALID_TAX_TYPES.join(", ")}`);
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
  validCampusIds: string[]
): ValidationResult {
  const errors: string[] = [];

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
  } else if (data.campusId && validCampusIds.length > 0 && !validCampusIds.includes(data.campusId)) {
    errors.push(`Invalid campus. Valid: ${validCampusIds.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
