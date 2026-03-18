/**
 * MIS Report aggregation engine.
 * Generates Cashflow Statement, P&L, and drill-down breakdowns
 * from existing expense/income data, matching the Excel MIS format.
 */

import { eq, and, sql, gte, lte } from "drizzle-orm";
import { db } from "./db.js";
import {
  expenses,
  expenseCategories,
  incomeRecords,
  incomeCategories,
  costCenters,
} from "../shared/schema.js";

// ── Types ──

export interface MISLineItem {
  label: string;
  values: number[];
  fyTotal: number;
}

export interface MISDrilldownItem {
  label: string;
  slug: string;
  values: number[];
  fyTotal: number;
}

export interface MISCashflow {
  openingBalance: number[];
  inflows: MISLineItem[];
  totalIncome: MISLineItem;
  outflows: MISLineItem[];
  totalOutflow: MISLineItem;
  netOperating: MISLineItem;
  investingActivities: MISLineItem[];
  netInvesting: MISLineItem;
  netCashFlow: MISLineItem;
  closingBalance: number[];
}

export interface MISPnL {
  revenueOffline: MISLineItem;
  revenueMedico: MISLineItem;
  totalRevenue: MISLineItem;
  directExpenses: MISLineItem[];
  totalDirectExpenses: MISLineItem;
  grossProfit: MISLineItem;
  grossProfitPct: number[];
  otherIncome: MISLineItem;
  indirectExpenses: MISLineItem[];
  totalIndirectExpenses: MISLineItem;
  ebitda: MISLineItem;
  ebitdaPct: number[];
}

export interface MISDrilldown {
  revenueByCenter: MISDrilldownItem[];
  totalRevenueByCenter: MISLineItem;
  electricityByCenter: MISDrilldownItem[];
  totalElectricity: MISLineItem;
  foodByCenter: MISDrilldownItem[];
  totalFood: MISLineItem;
  marketingByType: MISDrilldownItem[];
  totalMarketing: MISLineItem;
  capexByType: MISDrilldownItem[];
  totalCapex: MISLineItem;
  payrollBreakdown: MISDrilldownItem[];
  totalPayroll: MISLineItem;
  otherIndirect: MISDrilldownItem[];
  totalOtherIndirect: MISLineItem;
}

export interface MISReport {
  months: string[];
  fyLabel: string;
  cashflow: MISCashflow;
  pnl: MISPnL;
  drilldowns: MISDrilldown;
}

// ── Helpers ──

const MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

function lastDayOfMonth(year: number, month: number): number {
  // month is 0-based (0=Jan, 11=Dec)
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fyMonths(fyStartYear: number): { labels: string[]; startDates: string[]; endDates: string[] } {
  const labels: string[] = [];
  const startDates: string[] = [];
  const endDates: string[] = [];
  for (let i = 0; i < 12; i++) {
    const month = (3 + i) % 12; // Apr=3, May=4, ..., Mar=2
    const year = month >= 3 ? fyStartYear : fyStartYear + 1;
    const shortYear = String(year).slice(-2);
    labels.push(`${MONTH_LABELS[i]}'${shortYear}`);
    startDates.push(`${year}-${pad2(month + 1)}-01`);
    const lastDay = lastDayOfMonth(year, month);
    endDates.push(`${year}-${pad2(month + 1)}-${pad2(lastDay)}`);
  }
  return { labels, startDates, endDates };
}

function monthIndex(date: Date, fyStartYear: number): number {
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  if (m >= 3) {
    return y === fyStartYear ? m - 3 : -1;
  } else {
    return y === fyStartYear + 1 ? m + 9 : -1;
  }
}

function emptyValues(): number[] {
  return new Array(12).fill(0);
}

function sumValues(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0);
}

function makeLine(label: string, values: number[]): MISLineItem {
  return { label, values, fyTotal: sumValues(values) };
}

function subtractArrays(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]);
}

function addArrays(...arrays: number[][]): number[] {
  const result = emptyValues();
  for (const arr of arrays) {
    for (let i = 0; i < 12; i++) result[i] += arr[i];
  }
  return result;
}

function negateArray(a: number[]): number[] {
  return a.map((v) => -v);
}

function pctArray(numerator: number[], denominator: number[]): number[] {
  return numerator.map((n, i) => (denominator[i] !== 0 ? Math.round((n / denominator[i]) * 100) / 100 : 0));
}

// ── Cashflow categories mapping ──
// These slugs correspond to the seeded MIS expense categories
const CASHFLOW_OUTFLOW_SLUGS = [
  "rent_expenses",
  "faculty_payments",
  "operating_expenses",
  "employee_benefit_expenses",
  "advertising_expenses",
  "food_expenses_mess_bill",
  "commission_charges",
  "security_deposit_refund",
  "electricity_charges",
  "bank_charges",
  "income_tax_gst_payment",
  "legal_fee",
  "tds_payment",
];

const CASHFLOW_INVESTING_SLUGS = [
  "capital_expenditures",
  "rent_deposit_paid",
  "rent_deposit_refund",
];

// P&L classification
const DIRECT_EXPENSE_SLUGS = ["faculty_payments", "rent_expenses"];

const INDIRECT_EXPENSE_MAP: Record<string, string> = {
  employee_benefit_expenses: "Payroll Expenses",
  electricity_charges: "Electricity Charges",
  advertising_expenses: "Marketing Expenses",
  food_expenses_mess_bill: "Food Expenses",
};

// Slugs that appear in "Other Indirect Expenses" on the P&L
const OTHER_INDIRECT_SLUG = "operating_expenses";

// ── Main function ──

export async function getMISReport(tenantId: string, fy: string): Promise<MISReport> {
  const [startYearStr] = fy.split("-");
  const fyStartYear = parseInt(startYearStr, 10) + (parseInt(startYearStr, 10) < 100 ? 2000 : 0);
  const { labels, startDates, endDates } = fyMonths(fyStartYear);
  const fyStartDate = startDates[0];
  const fyEndDate = endDates[11];

  const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

  // Fetch all expenses in FY with their categories and cost centers
  const expenseRows = await db
    .select({
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      categorySlug: expenseCategories.slug,
      categoryName: expenseCategories.name,
      cashflowLabel: expenseCategories.cashflowLabel,
      parentId: expenseCategories.parentId,
      costCenterId: expenses.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        sql`${expenses.expenseDate} >= ${fyStartDate}::date`,
        sql`${expenses.expenseDate} <= ${fyEndDate}::date`,
      )
    );

  // Fetch all income in FY with categories and cost centers
  const incomeRows = await db
    .select({
      amount: incomeRecords.amount,
      incomeDate: incomeRecords.incomeDate,
      categorySlug: incomeCategories.slug,
      categoryName: incomeCategories.name,
      incomeType: incomeCategories.incomeType,
      costCenterId: incomeRecords.costCenterId,
      costCenterName: costCenters.name,
    })
    .from(incomeRecords)
    .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
    .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
    .where(
      and(
        eq(incomeRecords.tenantId, tenantId),
        sql`${incomeRecords.incomeDate} >= ${fyStartDate}::date`,
        sql`${incomeRecords.incomeDate} <= ${fyEndDate}::date`,
      )
    );

  // Fetch expense sub-categories (for drill-downs)
  const subCategoryRows = await db
    .select({
      id: expenseCategories.id,
      slug: expenseCategories.slug,
      name: expenseCategories.name,
      parentId: expenseCategories.parentId,
    })
    .from(expenseCategories)
    .where(eq(expenseCategories.tenantId, tenantId));

  const parentSlugById = new Map<string, string>();
  const catSlugById = new Map<string, string>();
  for (const sc of subCategoryRows) {
    catSlugById.set(sc.id, sc.slug);
  }
  for (const sc of subCategoryRows) {
    if (sc.parentId && catSlugById.has(sc.parentId)) {
      parentSlugById.set(sc.id, catSlugById.get(sc.parentId)!);
    }
  }

  // ── Build monthly aggregations ──

  // Income by category slug -> monthly values
  const incomeBySlug = new Map<string, number[]>();
  const incomeByCenterName = new Map<string, number[]>();

  for (const row of incomeRows) {
    const d = new Date(row.incomeDate);
    const mi = monthIndex(d, fyStartYear);
    if (mi < 0 || mi > 11) continue;

    const slug = row.categorySlug ?? "other_income";
    if (!incomeBySlug.has(slug)) incomeBySlug.set(slug, emptyValues());
    incomeBySlug.get(slug)![mi] += row.amount ?? 0;

    // Revenue by center (for non-medico income)
    if (slug !== "medico_revenue" && slug !== "other_income") {
      const center = row.costCenterName ?? "Unallocated";
      if (!incomeByCenterName.has(center)) incomeByCenterName.set(center, emptyValues());
      incomeByCenterName.get(center)![mi] += row.amount ?? 0;
    }
  }

  // Expenses by category slug -> monthly values
  const expenseBySlug = new Map<string, number[]>();
  // For drill-downs: expenses by parent slug -> child name -> monthly values
  const expenseByParentChild = new Map<string, Map<string, number[]>>();
  // Expenses by category slug + cost center name
  const expenseByCatCenter = new Map<string, Map<string, number[]>>();

  for (const row of expenseRows) {
    const d = new Date(row.expenseDate);
    const mi = monthIndex(d, fyStartYear);
    if (mi < 0 || mi > 11) continue;

    const slug = row.categorySlug ?? "unknown";
    const amt = row.amount ?? 0;

    // Aggregate to the parent if this is a sub-category
    const effectiveSlug = row.parentId ? (parentSlugById.get(row.parentId) ?? slug) : slug;

    // Top-level aggregation (use parent slug for roll-up)
    let topSlug = effectiveSlug;
    // Check if the slug itself has a parent
    for (const sc of subCategoryRows) {
      if (sc.slug === slug && sc.parentId) {
        const pSlug = catSlugById.get(sc.parentId);
        if (pSlug) topSlug = pSlug;
        break;
      }
    }

    if (!expenseBySlug.has(topSlug)) expenseBySlug.set(topSlug, emptyValues());
    expenseBySlug.get(topSlug)![mi] += amt;

    // Drill-down: by sub-category under parent
    if (topSlug !== slug) {
      if (!expenseByParentChild.has(topSlug)) expenseByParentChild.set(topSlug, new Map());
      const childMap = expenseByParentChild.get(topSlug)!;
      const childName = row.categoryName ?? slug;
      if (!childMap.has(childName)) childMap.set(childName, emptyValues());
      childMap.get(childName)![mi] += amt;
    }

    // By cost center for specific categories
    const centerName = row.costCenterName ?? "Unallocated";
    if (!expenseByCatCenter.has(topSlug)) expenseByCatCenter.set(topSlug, new Map());
    const ccMap = expenseByCatCenter.get(topSlug)!;
    if (!ccMap.has(centerName)) ccMap.set(centerName, emptyValues());
    ccMap.get(centerName)![mi] += amt;
  }

  // ── Build Cashflow Statement ──

  const inflowItems: MISLineItem[] = [];
  const INFLOW_SLUGS = [
    { slug: "medico_revenue", label: "Medico-Revenue" },
    { slug: "academic_income", label: "Academic Income (Including Crash Batch)" },
    { slug: "hostel_income", label: "Hostel Income (Including Electricity Charges)" },
    { slug: "security_deposit_collected", label: "Security Deposit Collected" },
    { slug: "revenue_sharing_tips", label: "Revenue Sharing Income (TIPS)" },
    { slug: "reading_room", label: "Reading Room" },
    { slug: "other_income", label: "Other Income" },
    { slug: "study_material", label: "Study Material" },
  ];

  for (const { slug, label } of INFLOW_SLUGS) {
    const vals = incomeBySlug.get(slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      inflowItems.push(makeLine(label, vals));
    }
  }

  // Add any other income categories not in the standard list
  for (const [slug, vals] of incomeBySlug) {
    if (!INFLOW_SLUGS.some((s) => s.slug === slug) && sumValues(vals) !== 0) {
      inflowItems.push(makeLine(slug, vals));
    }
  }

  const totalIncomeVals = addArrays(...inflowItems.map((i) => i.values));

  // Build slug->name lookup from expense rows for labeling
  const slugToName = new Map<string, string>();
  for (const sc of subCategoryRows) {
    if (!sc.parentId) slugToName.set(sc.slug, sc.name);
  }
  for (const row of expenseRows) {
    if (row.categorySlug && row.categoryName && !slugToName.has(row.categorySlug)) {
      slugToName.set(row.categorySlug, row.categoryName);
    }
  }

  function expenseLabel(slug: string): string {
    return slugToName.get(slug) ?? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const knownCashflowSlugs = new Set([...CASHFLOW_OUTFLOW_SLUGS, ...CASHFLOW_INVESTING_SLUGS]);

  const outflowItems: MISLineItem[] = [];
  for (const slug of CASHFLOW_OUTFLOW_SLUGS) {
    const vals = expenseBySlug.get(slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      outflowItems.push(makeLine(expenseLabel(slug), negateArray(vals)));
    }
  }
  // Include any expense categories NOT in the known MIS lists
  for (const [slug, vals] of expenseBySlug) {
    if (!knownCashflowSlugs.has(slug) && sumValues(vals) !== 0) {
      outflowItems.push(makeLine(expenseLabel(slug), negateArray(vals)));
    }
  }

  const totalOutflowVals = addArrays(...outflowItems.map((i) => i.values));

  const netOperatingVals = addArrays(totalIncomeVals, totalOutflowVals);

  const investingItems: MISLineItem[] = [];
  for (const slug of CASHFLOW_INVESTING_SLUGS) {
    const vals = expenseBySlug.get(slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      investingItems.push(makeLine(expenseLabel(slug), negateArray(vals)));
    }
  }

  const netInvestingVals = addArrays(...investingItems.map((i) => i.values));

  const netCashFlowVals = addArrays(netOperatingVals, netInvestingVals);

  // Opening/closing balance computation (cumulative)
  const openingBalance = emptyValues();
  const closingBalance = emptyValues();
  for (let i = 0; i < 12; i++) {
    openingBalance[i] = i === 0 ? 0 : closingBalance[i - 1];
    closingBalance[i] = openingBalance[i] + netCashFlowVals[i];
  }

  // ── Build P&L ──

  // Revenue excludes "Other Income" (it's added separately before EBITDA)
  const revenueMedicoVals = incomeBySlug.get("medico_revenue") ?? emptyValues();
  const otherIncomeVals = incomeBySlug.get("other_income") ?? emptyValues();
  const totalRevenueVals = subtractArrays(totalIncomeVals, otherIncomeVals);
  const revenueOfflineVals = subtractArrays(totalRevenueVals, revenueMedicoVals);

  // Track which expense slugs are accounted for in the P&L
  const pnlAccountedSlugs = new Set<string>([...DIRECT_EXPENSE_SLUGS, ...Object.keys(INDIRECT_EXPENSE_MAP), OTHER_INDIRECT_SLUG, ...CASHFLOW_INVESTING_SLUGS]);

  // Direct Expenses
  const directExpenseItems: MISLineItem[] = [];
  for (const slug of DIRECT_EXPENSE_SLUGS) {
    const vals = expenseBySlug.get(slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      directExpenseItems.push(makeLine(expenseLabel(slug), vals));
    }
  }
  const totalDirectVals = addArrays(...directExpenseItems.map((i) => i.values));

  // Gross Profit
  const grossProfitVals = subtractArrays(totalRevenueVals, totalDirectVals);
  const grossProfitPctVals = pctArray(grossProfitVals, totalRevenueVals);

  // Other Income (already computed above as otherIncomeVals)

  // Indirect Expenses
  const indirectExpenseItems: MISLineItem[] = [];
  for (const [slug, label] of Object.entries(INDIRECT_EXPENSE_MAP)) {
    const vals = expenseBySlug.get(slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      indirectExpenseItems.push(makeLine(label, vals));
    }
  }
  // "Other Indirect Expenses" from operating_expenses slug
  const otherIndirectVals = expenseBySlug.get(OTHER_INDIRECT_SLUG) ?? emptyValues();
  if (sumValues(otherIndirectVals) !== 0) {
    indirectExpenseItems.push(makeLine("Other Indirect Expenses", otherIndirectVals));
  }
  // Include any remaining expense categories not yet accounted for
  for (const [slug, vals] of expenseBySlug) {
    if (!pnlAccountedSlugs.has(slug) && sumValues(vals) !== 0) {
      indirectExpenseItems.push(makeLine(expenseLabel(slug), vals));
    }
  }

  const totalIndirectVals = addArrays(...indirectExpenseItems.map((i) => i.values));

  // EBITDA
  const ebitdaVals = subtractArrays(
    addArrays(grossProfitVals, otherIncomeVals),
    totalIndirectVals
  );
  const ebitdaPctVals = pctArray(ebitdaVals, totalRevenueVals);

  // ── Build Drill-downs ──

  function toSlug(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 60);
  }

  function buildDrilldown(
    source: Map<string, number[]>,
    totalLabel: string
  ): { items: MISDrilldownItem[]; total: MISLineItem } {
    const items: MISDrilldownItem[] = [];
    const allVals = emptyValues();
    for (const [label, vals] of source) {
      if (sumValues(vals) !== 0) {
        items.push({ label, slug: toSlug(label), values: vals, fyTotal: sumValues(vals) });
        for (let i = 0; i < 12; i++) allVals[i] += vals[i];
      }
    }
    items.sort((a, b) => b.fyTotal - a.fyTotal);
    return { items, total: makeLine(totalLabel, allVals) };
  }

  function buildCenterDrilldown(slug: string, totalLabel: string) {
    const centers = expenseByCatCenter.get(slug) ?? new Map();
    return buildDrilldown(centers, totalLabel);
  }

  function buildSubCatDrilldown(slug: string, totalLabel: string) {
    const children = expenseByParentChild.get(slug) ?? new Map();
    // If no sub-categories, use center breakdown
    if (children.size === 0) {
      return buildCenterDrilldown(slug, totalLabel);
    }
    return buildDrilldown(children, totalLabel);
  }

  // Revenue by center
  const revByCenterResult = buildDrilldown(incomeByCenterName, "Total Revenue from Centres");

  // Electricity, Food by center
  const elecResult = buildCenterDrilldown("electricity_charges", "Total Electricity Charges");
  const foodResult = buildCenterDrilldown("food_expenses_mess_bill", "Total Food Expenses");

  // Marketing, Capex, Payroll by sub-category
  const marketingResult = buildSubCatDrilldown("advertising_expenses", "Total Marketing Expenses");
  const capexResult = buildSubCatDrilldown("capital_expenditures", "Total Capex");
  const payrollResult = buildSubCatDrilldown("employee_benefit_expenses", "Total Payroll Expenses");

  // Other Indirect Expenses detailed
  const otherIndirectResult = buildSubCatDrilldown("operating_expenses", "Total Other Indirect Expenses");

  return {
    months: labels,
    fyLabel,
    cashflow: {
      openingBalance,
      inflows: inflowItems,
      totalIncome: makeLine("Total Income", totalIncomeVals),
      outflows: outflowItems,
      totalOutflow: makeLine("Total Cash Outflow", totalOutflowVals),
      netOperating: makeLine("Net Cash from Operating Activities", netOperatingVals),
      investingActivities: investingItems,
      netInvesting: makeLine("Net Cash from Investing Activities", netInvestingVals),
      netCashFlow: makeLine("Net Cash Flow", netCashFlowVals),
      closingBalance,
    },
    pnl: {
      revenueOffline: makeLine("Revenue (Offline)", revenueOfflineVals),
      revenueMedico: makeLine("Revenue (Medico)", revenueMedicoVals),
      totalRevenue: makeLine("Total Revenue", totalRevenueVals),
      directExpenses: directExpenseItems,
      totalDirectExpenses: makeLine("Total Direct Expenses", totalDirectVals),
      grossProfit: makeLine("Gross Profit", grossProfitVals),
      grossProfitPct: grossProfitPctVals,
      otherIncome: makeLine("Other Income", otherIncomeVals),
      indirectExpenses: indirectExpenseItems,
      totalIndirectExpenses: makeLine("Total Indirect Expenses", totalIndirectVals),
      ebitda: makeLine("EBITDA", ebitdaVals),
      ebitdaPct: ebitdaPctVals,
    },
    drilldowns: {
      revenueByCenter: revByCenterResult.items,
      totalRevenueByCenter: revByCenterResult.total,
      electricityByCenter: elecResult.items,
      totalElectricity: elecResult.total,
      foodByCenter: foodResult.items,
      totalFood: foodResult.total,
      marketingByType: marketingResult.items,
      totalMarketing: marketingResult.total,
      capexByType: capexResult.items,
      totalCapex: capexResult.total,
      payrollBreakdown: payrollResult.items,
      totalPayroll: payrollResult.total,
      otherIndirect: otherIndirectResult.items,
      totalOtherIndirect: otherIndirectResult.total,
    },
  };
}

/**
 * Get list of transactions for a specific category/month combination (cell drill-down).
 */
export async function getMISCellTransactions(
  tenantId: string,
  fy: string,
  type: "expense" | "income",
  categorySlug: string,
  monthIdx: number
) {
  const [startYearStr] = fy.split("-");
  const fyStartYear = parseInt(startYearStr, 10) + (parseInt(startYearStr, 10) < 100 ? 2000 : 0);
  const { startDates, endDates } = fyMonths(fyStartYear);

  if (monthIdx < 0 || monthIdx > 11) return [];

  const monthStart = startDates[monthIdx];
  const monthEnd = endDates[monthIdx];

  if (type === "expense") {
    // Find category ids matching the slug (including sub-categories)
    const cats = await db
      .select({ id: expenseCategories.id, slug: expenseCategories.slug, parentId: expenseCategories.parentId })
      .from(expenseCategories)
      .where(eq(expenseCategories.tenantId, tenantId));

    const targetId = cats.find((c) => c.slug === categorySlug)?.id;
    const matchIds = new Set<string>();
    if (targetId) {
      matchIds.add(targetId);
      // Include sub-categories
      for (const c of cats) {
        if (c.parentId === targetId) matchIds.add(c.id);
      }
    }

    if (matchIds.size === 0) return [];

    const rows = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        description: expenses.description,
        particulars: expenses.particulars,
        vendorName: expenses.vendorName,
        categoryName: expenseCategories.name,
        costCenterName: costCenters.name,
        status: expenses.status,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          sql`${expenses.expenseDate} >= ${monthStart}::date`,
          sql`${expenses.expenseDate} <= ${monthEnd}::date`,
          sql`${expenses.categoryId} IN (${sql.join(
            [...matchIds].map((id) => sql`${id}`),
            sql`, `
          )})`,
        )
      );

    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      date: r.expenseDate,
      description: r.description ?? r.particulars ?? "",
      vendor: r.vendorName ?? "",
      category: r.categoryName ?? "",
      costCenter: r.costCenterName ?? "",
      status: r.status,
    }));
  } else {
    // Income
    const rows = await db
      .select({
        id: incomeRecords.id,
        amount: incomeRecords.amount,
        incomeDate: incomeRecords.incomeDate,
        particulars: incomeRecords.particulars,
        categoryName: incomeCategories.name,
        costCenterName: costCenters.name,
      })
      .from(incomeRecords)
      .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
      .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
      .where(
        and(
          eq(incomeRecords.tenantId, tenantId),
          sql`${incomeRecords.incomeDate} >= ${monthStart}::date`,
          sql`${incomeRecords.incomeDate} <= ${monthEnd}::date`,
          sql`${incomeCategories.slug} = ${categorySlug}`,
        )
      );

    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      date: r.incomeDate,
      description: r.particulars ?? "",
      vendor: "",
      category: r.categoryName ?? "",
      costCenter: r.costCenterName ?? "",
      status: "recorded",
    }));
  }
}
