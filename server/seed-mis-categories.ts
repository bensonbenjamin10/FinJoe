/**
 * Reusable MIS category seeding for any tenant.
 * Called automatically on tenant creation and available as a standalone endpoint.
 *
 * Each category now includes MIS classification metadata (cashflowSection,
 * pnlSection, drilldownMode) so the MIS engine reads config from the DB
 * instead of hardcoded slug arrays.
 */

import { eq, and } from "drizzle-orm";
import { db } from "./db.js";
import { expenseCategories, incomeCategories, incomeTypes } from "../shared/schema.js";
import { logger } from "./logger.js";

// ── Data Definitions ──

const MIS_EXPENSE_CATEGORIES = [
  { name: "Rent Expenses", slug: "rent_expenses", cashflowLabel: "Rent Expenses", displayOrder: 10, cashflowSection: "operating_outflow" as const, pnlSection: "direct" as const, drilldownMode: "none" as const },
  { name: "Faculty Payments (Including Medico)", slug: "faculty_payments", cashflowLabel: "Faculty Payments (Including Medico)", displayOrder: 11, cashflowSection: "operating_outflow" as const, pnlSection: "direct" as const, drilldownMode: "none" as const },
  { name: "Operating Expenses (Opex)", slug: "operating_expenses", cashflowLabel: "Operating Expenses (Opex)", displayOrder: 12, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "by_subcategory" as const },
  { name: "Employee Benefit Expenses (Salary)", slug: "employee_benefit_expenses", cashflowLabel: "Employee Benefit Expenses (Salary expenses)", displayOrder: 13, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "by_subcategory" as const },
  { name: "Advertising Expenses", slug: "advertising_expenses", cashflowLabel: "Advertising Expenses", displayOrder: 14, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "by_subcategory" as const },
  { name: "Food Expenses (Mess Bill)", slug: "food_expenses_mess_bill", cashflowLabel: "Food Expenses (Mess Bill)", displayOrder: 15, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "by_center" as const },
  { name: "Commission Charges", slug: "commission_charges", cashflowLabel: "Commission Charges", displayOrder: 16, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "none" as const },
  { name: "Security Deposit Refund (SD Refund)", slug: "security_deposit_refund", cashflowLabel: "Security Deposit Refund (SD Refund)", displayOrder: 17, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "none" as const },
  { name: "Electricity Charges", slug: "electricity_charges", cashflowLabel: "Electricity Charges", displayOrder: 18, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "by_center" as const },
  { name: "Bank Charges", slug: "bank_charges", cashflowLabel: "Bank Charges", displayOrder: 19, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "none" as const },
  { name: "Income Tax & GST Payment", slug: "income_tax_gst_payment", cashflowLabel: "Income Tax & GST Payment", displayOrder: 20, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "none" as const },
  { name: "Legal Fee", slug: "legal_fee", cashflowLabel: "Legal Fee", displayOrder: 21, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "none" as const },
  { name: "TDS Payment", slug: "tds_payment", cashflowLabel: "TDS Payment", displayOrder: 22, cashflowSection: "operating_outflow" as const, pnlSection: "indirect" as const, drilldownMode: "none" as const },
  { name: "Capital Expenditures (Capex)", slug: "capital_expenditures", cashflowLabel: "Capital Expenditures (Capex)", displayOrder: 23, cashflowSection: "investing" as const, pnlSection: "excluded" as const, drilldownMode: "by_subcategory" as const },
  { name: "Rent Deposit Paid", slug: "rent_deposit_paid", cashflowLabel: "Rent Deposit Paid", displayOrder: 24, cashflowSection: "investing" as const, pnlSection: "excluded" as const, drilldownMode: "none" as const },
  { name: "Rent Deposit Refund", slug: "rent_deposit_refund", cashflowLabel: "Rent Deposit Refund", displayOrder: 25, cashflowSection: "investing" as const, pnlSection: "excluded" as const, drilldownMode: "none" as const },
];

const MIS_INCOME_CATEGORIES = [
  { name: "Academic Income (Including Crash Batch)", slug: "academic_income", incomeType: "academic", displayOrder: 10, misClassification: "revenue" as const, revenueGroup: "offline" },
  { name: "Hostel Income (Including Electricity Charges)", slug: "hostel_income", incomeType: "hostel", displayOrder: 11, misClassification: "revenue" as const, revenueGroup: "offline" },
  { name: "Medico-Revenue", slug: "medico_revenue", incomeType: "medico", displayOrder: 12, misClassification: "revenue" as const, revenueGroup: "medico" },
  { name: "Security Deposit Collected", slug: "security_deposit_collected", incomeType: "deposit", displayOrder: 13, misClassification: "revenue" as const, revenueGroup: "offline" },
  { name: "Revenue Sharing Income (TIPS)", slug: "revenue_sharing_tips", incomeType: "revenue_share", displayOrder: 14, misClassification: "revenue" as const, revenueGroup: "offline" },
  { name: "Reading Room", slug: "reading_room", incomeType: "facility", displayOrder: 15, misClassification: "revenue" as const, revenueGroup: "offline" },
  { name: "Study Material", slug: "study_material", incomeType: "academic", displayOrder: 16, misClassification: "revenue" as const, revenueGroup: "offline" },
  { name: "Other Income", slug: "other_income", incomeType: "other", displayOrder: 17, misClassification: "other_income" as const, revenueGroup: null },
];

const MIS_SUB_CATEGORIES: Record<string, Array<{ name: string; slug: string; displayOrder: number }>> = {
  advertising_expenses: [
    { name: "FB Ads", slug: "fb_ads", displayOrder: 1 },
    { name: "Google Ads", slug: "google_ads", displayOrder: 2 },
    { name: "Promotional Expenses", slug: "promotional_expenses", displayOrder: 3 },
    { name: "Shoot Expenses", slug: "shoot_expenses", displayOrder: 4 },
    { name: "FPL Technologies", slug: "fpl_technologies", displayOrder: 5 },
    { name: "META", slug: "meta_ads", displayOrder: 6 },
    { name: "Other Marketing", slug: "other_marketing", displayOrder: 7 },
  ],
  capital_expenditures: [
    { name: "Air Conditioner", slug: "air_conditioner", displayOrder: 1 },
    { name: "Printer", slug: "printer", displayOrder: 2 },
    { name: "Computers", slug: "computers", displayOrder: 3 },
    { name: "Electrical Items & Fittings", slug: "electrical_items_fittings", displayOrder: 4 },
    { name: "Furniture & Fittings", slug: "furniture_fittings", displayOrder: 5 },
    { name: "Mattresses & Curtains", slug: "mattresses_curtains", displayOrder: 6 },
    { name: "Mobile", slug: "mobile", displayOrder: 7 },
  ],
  employee_benefit_expenses: [
    { name: "Salary Expenses", slug: "salary_expenses", displayOrder: 1 },
    { name: "Bonus & Other Perquisites", slug: "bonus_perquisites", displayOrder: 2 },
  ],
  operating_expenses: [
    { name: "Bank Charges", slug: "opex_bank_charges", displayOrder: 1 },
    { name: "Loan Processing Charges", slug: "loan_processing_charges", displayOrder: 2 },
    { name: "Accounting Charges", slug: "accounting_charges", displayOrder: 3 },
    { name: "Bizpay Fund Pooling & Petty Expenses", slug: "bizpay_petty", displayOrder: 4 },
    { name: "Commission Expenses", slug: "commission_expenses_sub", displayOrder: 5 },
    { name: "Internet & Telephone Charges", slug: "internet_telephone", displayOrder: 6 },
    { name: "Office Expenses", slug: "office_expenses", displayOrder: 7 },
    { name: "Other Expenses", slug: "other_expenses", displayOrder: 8 },
    { name: "Repair & Maintenance", slug: "repair_maintenance", displayOrder: 9 },
    { name: "Study Material Expenses", slug: "study_material_expenses", displayOrder: 10 },
    { name: "Subscription Charges", slug: "subscription_charges", displayOrder: 11 },
    { name: "Rental Registration Charges", slug: "rental_registration", displayOrder: 12 },
    { name: "Travel & Stay Expenses", slug: "travel_stay", displayOrder: 13 },
    { name: "Water Charges", slug: "water_charges", displayOrder: 14 },
    { name: "Printing Expenses", slug: "printing_expenses", displayOrder: 15 },
    { name: "Campus Shifting Expense", slug: "campus_shifting", displayOrder: 16 },
    { name: "TDS Payment", slug: "opex_tds_payment", displayOrder: 17 },
    { name: "Provision of Items", slug: "provision_items", displayOrder: 18 },
    { name: "Hostel Expenses", slug: "hostel_expenses", displayOrder: 19 },
    { name: "Staff Insurance", slug: "staff_insurance", displayOrder: 20 },
    { name: "Credit Card Charges", slug: "credit_card_charges", displayOrder: 21 },
    { name: "ITR Payment - Firm", slug: "itr_payment", displayOrder: 22 },
    { name: "Operating Expense (Other)", slug: "operating_expense_other", displayOrder: 23 },
  ],
};

const DEFAULT_INCOME_TYPES = [
  { slug: "registration_fee", label: "Registration Fee", displayOrder: 0 },
  { slug: "remaining_fee", label: "Remaining Fee", displayOrder: 1 },
  { slug: "hostel_fee", label: "Hostel Fee", displayOrder: 2 },
  { slug: "other", label: "Other", displayOrder: 3 },
];

// ── Main Seed Function ──

export interface SeedResult {
  expenses: number;
  income: number;
  subCategories: number;
  incomeTypesSeeded: number;
}

export async function seedMISCategoriesForTenant(tenantId: string): Promise<SeedResult> {
  const result: SeedResult = { expenses: 0, income: 0, subCategories: 0, incomeTypesSeeded: 0 };

  for (const it of DEFAULT_INCOME_TYPES) {
    try {
      await db.insert(incomeTypes).values({
        tenantId,
        slug: it.slug,
        label: it.label,
        displayOrder: it.displayOrder,
      });
      result.incomeTypesSeeded++;
    } catch (e: any) {
      if (e?.code !== "23505") throw e;
    }
  }

  for (const cat of MIS_EXPENSE_CATEGORIES) {
    const [existing] = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.tenantId, tenantId), eq(expenseCategories.slug, cat.slug)))
      .limit(1);
    if (existing) continue;

    await db.insert(expenseCategories).values({
      tenantId,
      name: cat.name,
      slug: cat.slug,
      cashflowLabel: cat.cashflowLabel,
      cashflowSection: cat.cashflowSection,
      pnlSection: cat.pnlSection,
      drilldownMode: cat.drilldownMode,
      displayOrder: cat.displayOrder,
      isActive: true,
    });
    result.expenses++;
  }

  for (const cat of MIS_INCOME_CATEGORIES) {
    const [existing] = await db
      .select({ id: incomeCategories.id })
      .from(incomeCategories)
      .where(and(eq(incomeCategories.tenantId, tenantId), eq(incomeCategories.slug, cat.slug)))
      .limit(1);
    if (existing) continue;

    await db.insert(incomeCategories).values({
      tenantId,
      name: cat.name,
      slug: cat.slug,
      incomeType: cat.incomeType,
      misClassification: cat.misClassification,
      revenueGroup: cat.revenueGroup,
      displayOrder: cat.displayOrder,
      isActive: true,
    });
    result.income++;
  }

  for (const [parentSlug, children] of Object.entries(MIS_SUB_CATEGORIES)) {
    const [parent] = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.tenantId, tenantId), eq(expenseCategories.slug, parentSlug)))
      .limit(1);
    if (!parent) {
      logger.warn("Seed: parent category not found, skipping children", { tenantId, parentSlug });
      continue;
    }

    for (const sub of children) {
      const [existing] = await db
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(and(eq(expenseCategories.tenantId, tenantId), eq(expenseCategories.slug, sub.slug)))
        .limit(1);
      if (existing) continue;

      await db.insert(expenseCategories).values({
        tenantId,
        name: sub.name,
        slug: sub.slug,
        cashflowLabel: sub.name,
        cashflowSection: "none",
        pnlSection: "excluded",
        drilldownMode: "none",
        parentId: parent.id,
        displayOrder: sub.displayOrder,
        isActive: true,
      });
      result.subCategories++;
    }
  }

  return result;
}
