/**
 * MIS Report aggregation engine.
 * Generates Cashflow Statement, P&L, and drill-down breakdowns
 * from existing expense/income data.
 *
 * All classification (cashflow section, P&L section, drilldown mode)
 * is read from category metadata columns -- nothing is hardcoded.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  expenses,
  expenseCategories,
  incomeRecords,
  incomeCategories,
  costCenters,
  finjoeSettings,
} from "../shared/schema.js";

// ── Types ──

export interface MISLineItem {
  label: string;
  slug?: string;
  values: number[];
  fyTotal: number;
}

export interface MISDrilldownItem {
  label: string;
  slug: string;
  values: number[];
  fyTotal: number;
}

export interface MISDrilldownSection {
  slug: string;
  label: string;
  mode: "by_center" | "by_subcategory";
  items: MISDrilldownItem[];
  total: MISLineItem;
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
  revenueGroups: MISLineItem[];
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
  sections: MISDrilldownSection[];
}

export interface MISReport {
  months: string[];
  fyLabel: string;
  fyStartMonth: number;
  cashflow: MISCashflow;
  pnl: MISPnL;
  drilldowns: MISDrilldown;
}

// ── Helpers ──

const ALL_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Exported for MIS period slicing (CFO insights) — FY month boundaries. */
export function fyMonths(fyStartYear: number, fyStartMonth: number): { labels: string[]; startDates: string[]; endDates: string[] } {
  const labels: string[] = [];
  const startDates: string[] = [];
  const endDates: string[] = [];
  const startIdx = fyStartMonth - 1; // 0-based (3 for April)
  for (let i = 0; i < 12; i++) {
    const month = (startIdx + i) % 12;
    const year = month >= startIdx ? fyStartYear : fyStartYear + 1;
    const shortYear = String(year).slice(-2);
    labels.push(`${ALL_MONTH_LABELS[month]}'${shortYear}`);
    startDates.push(`${year}-${pad2(month + 1)}-01`);
    const lastDay = lastDayOfMonth(year, month);
    endDates.push(`${year}-${pad2(month + 1)}-${pad2(lastDay)}`);
  }
  return { labels, startDates, endDates };
}

function monthIndex(date: Date, fyStartYear: number, fyStartMonth: number): number {
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  const startIdx = fyStartMonth - 1;
  if (m >= startIdx) {
    return y === fyStartYear ? m - startIdx : -1;
  } else {
    return y === fyStartYear + 1 ? m + (12 - startIdx) : -1;
  }
}

function emptyValues(): number[] {
  return new Array(12).fill(0);
}

function sumValues(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0);
}

function makeLine(label: string, values: number[], slug?: string): MISLineItem {
  return { label, slug, values, fyTotal: sumValues(values) };
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

// ── Main function ──

export async function getMISReport(tenantId: string, fy: string, throughDate?: string): Promise<MISReport> {
  const [startYearStr] = fy.split("-");
  const fyStartYear = parseInt(startYearStr, 10) + (parseInt(startYearStr, 10) < 100 ? 2000 : 0);

  // Read tenant FY start month from settings (default: April = 4)
  const [settingsRow] = await db
    .select({ fyStartMonth: finjoeSettings.fyStartMonth })
    .from(finjoeSettings)
    .where(eq(finjoeSettings.tenantId, tenantId))
    .limit(1);
  const fyStartMonth = settingsRow?.fyStartMonth ?? 4;

  const { labels, startDates, endDates } = fyMonths(fyStartYear, fyStartMonth);
  const fyStartDate = startDates[0];
  const fyEndDate = endDates[11];
  const effectiveEndDate = throughDate && throughDate <= fyEndDate ? throughDate : fyEndDate;
  const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

  // ── Load all category metadata for this tenant ──

  const allExpenseCats = await db
    .select({
      id: expenseCategories.id,
      slug: expenseCategories.slug,
      name: expenseCategories.name,
      parentId: expenseCategories.parentId,
      cashflowSection: expenseCategories.cashflowSection,
      pnlSection: expenseCategories.pnlSection,
      drilldownMode: expenseCategories.drilldownMode,
      misDisplayLabel: expenseCategories.misDisplayLabel,
      displayOrder: expenseCategories.displayOrder,
    })
    .from(expenseCategories)
    .where(eq(expenseCategories.tenantId, tenantId));

  const allIncomeCats = await db
    .select({
      id: incomeCategories.id,
      slug: incomeCategories.slug,
      name: incomeCategories.name,
      misClassification: incomeCategories.misClassification,
      revenueGroup: incomeCategories.revenueGroup,
      misDisplayLabel: incomeCategories.misDisplayLabel,
      displayOrder: incomeCategories.displayOrder,
    })
    .from(incomeCategories)
    .where(eq(incomeCategories.tenantId, tenantId));

  // Build lookup maps
  const catSlugById = new Map<string, string>();
  const parentSlugById = new Map<string, string>();
  const topLevelExpCats = new Map<string, typeof allExpenseCats[0]>();

  for (const c of allExpenseCats) {
    catSlugById.set(c.id, c.slug);
    if (!c.parentId) topLevelExpCats.set(c.slug, c);
  }
  for (const c of allExpenseCats) {
    if (c.parentId && catSlugById.has(c.parentId)) {
      parentSlugById.set(c.id, catSlugById.get(c.parentId)!);
    }
  }

  function expLabel(slug: string): string {
    const cat = topLevelExpCats.get(slug);
    if (cat) return cat.misDisplayLabel ?? cat.name;
    return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function incLabel(cat: typeof allIncomeCats[0]): string {
    return cat.misDisplayLabel ?? cat.name;
  }

  // ── Fetch expense and income rows ──

  const expenseRows = await db
    .select({
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      categorySlug: expenseCategories.slug,
      categoryName: expenseCategories.name,
      parentId: expenseCategories.parentId,
      costCenterName: costCenters.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        sql`${expenses.expenseDate} >= ${fyStartDate}::date`,
        sql`${expenses.expenseDate} <= ${effectiveEndDate}::date`,
      )
    );

  const incomeRows = await db
    .select({
      amount: incomeRecords.amount,
      incomeDate: incomeRecords.incomeDate,
      categorySlug: incomeCategories.slug,
      categoryName: incomeCategories.name,
      costCenterName: costCenters.name,
    })
    .from(incomeRecords)
    .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
    .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
    .where(
      and(
        eq(incomeRecords.tenantId, tenantId),
        sql`${incomeRecords.incomeDate} >= ${fyStartDate}::date`,
        sql`${incomeRecords.incomeDate} <= ${effectiveEndDate}::date`,
      )
    );

  // ── Build monthly aggregations ──

  // Income by category slug
  const incomeBySlug = new Map<string, number[]>();
  const incomeByCenterName = new Map<string, number[]>();
  const incCatLookup = new Map(allIncomeCats.map((c) => [c.slug, c]));

  for (const row of incomeRows) {
    if (!row.incomeDate) continue;
    const d = new Date(row.incomeDate);
    const mi = monthIndex(d, fyStartYear, fyStartMonth);
    if (mi < 0 || mi > 11) continue;

    const slug = row.categorySlug ?? "other_income";
    if (!incomeBySlug.has(slug)) incomeBySlug.set(slug, emptyValues());
    incomeBySlug.get(slug)![mi] += row.amount ?? 0;

    const cat = incCatLookup.get(slug);
    if (cat && cat.misClassification === "revenue") {
      const center = row.costCenterName ?? "Unallocated";
      if (!incomeByCenterName.has(center)) incomeByCenterName.set(center, emptyValues());
      incomeByCenterName.get(center)![mi] += row.amount ?? 0;
    }
  }

  // Expenses by top-level slug
  const expenseBySlug = new Map<string, number[]>();
  const expenseByParentChild = new Map<string, Map<string, number[]>>();
  const expenseByCatCenter = new Map<string, Map<string, number[]>>();

  for (const row of expenseRows) {
    if (!row.expenseDate) continue;
    const d = new Date(row.expenseDate);
    const mi = monthIndex(d, fyStartYear, fyStartMonth);
    if (mi < 0 || mi > 11) continue;

    const slug = row.categorySlug ?? "unknown";
    const amt = row.amount ?? 0;

    // Roll up to parent slug
    let topSlug = slug;
    for (const sc of allExpenseCats) {
      if (sc.slug === slug && sc.parentId) {
        const pSlug = catSlugById.get(sc.parentId);
        if (pSlug) topSlug = pSlug;
        break;
      }
    }

    if (!expenseBySlug.has(topSlug)) expenseBySlug.set(topSlug, emptyValues());
    expenseBySlug.get(topSlug)![mi] += amt;

    if (topSlug !== slug) {
      if (!expenseByParentChild.has(topSlug)) expenseByParentChild.set(topSlug, new Map());
      const childMap = expenseByParentChild.get(topSlug)!;
      const childName = row.categoryName ?? slug;
      if (!childMap.has(childName)) childMap.set(childName, emptyValues());
      childMap.get(childName)![mi] += amt;
    }

    const centerName = row.costCenterName ?? "Unallocated";
    if (!expenseByCatCenter.has(topSlug)) expenseByCatCenter.set(topSlug, new Map());
    const ccMap = expenseByCatCenter.get(topSlug)!;
    if (!ccMap.has(centerName)) ccMap.set(centerName, emptyValues());
    ccMap.get(centerName)![mi] += amt;
  }

  // ── Build Cashflow Statement (from metadata) ──

  const outflowCats = [...topLevelExpCats.values()]
    .filter((c) => c.cashflowSection === "operating_outflow")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const investingCats = [...topLevelExpCats.values()]
    .filter((c) => c.cashflowSection === "investing")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const knownCashflowSlugs = new Set([...outflowCats.map((c) => c.slug), ...investingCats.map((c) => c.slug)]);

  // Inflows from income categories
  const inflowItems: MISLineItem[] = [];
  const sortedIncomeCats = [...allIncomeCats]
    .filter((c) => c.misClassification !== "excluded")
    .sort((a, b) => a.displayOrder - b.displayOrder);

  for (const cat of sortedIncomeCats) {
    const vals = incomeBySlug.get(cat.slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      inflowItems.push(makeLine(incLabel(cat), vals, cat.slug));
    }
  }
  // Any remaining income slugs not in categories
  for (const [slug, vals] of incomeBySlug) {
    if (!allIncomeCats.some((c) => c.slug === slug) && sumValues(vals) !== 0) {
      inflowItems.push(makeLine(slug, vals, slug));
    }
  }

  const totalIncomeVals = addArrays(...inflowItems.map((i) => i.values));

  // Outflows
  const outflowItems: MISLineItem[] = [];
  for (const cat of outflowCats) {
    const vals = expenseBySlug.get(cat.slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      outflowItems.push(makeLine(expLabel(cat.slug), negateArray(vals), cat.slug));
    }
  }
  // Unknown categories default to outflow
  for (const [slug, vals] of expenseBySlug) {
    if (!knownCashflowSlugs.has(slug) && sumValues(vals) !== 0) {
      outflowItems.push(makeLine(expLabel(slug), negateArray(vals), slug));
    }
  }

  const totalOutflowVals = addArrays(...outflowItems.map((i) => i.values));
  const netOperatingVals = addArrays(totalIncomeVals, totalOutflowVals);

  const investingItems: MISLineItem[] = [];
  for (const cat of investingCats) {
    const vals = expenseBySlug.get(cat.slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      investingItems.push(makeLine(expLabel(cat.slug), negateArray(vals), cat.slug));
    }
  }
  const netInvestingVals = addArrays(...investingItems.map((i) => i.values));
  const netCashFlowVals = addArrays(netOperatingVals, netInvestingVals);

  const openingBalance = emptyValues();
  const closingBalance = emptyValues();
  for (let i = 0; i < 12; i++) {
    openingBalance[i] = i === 0 ? 0 : closingBalance[i - 1];
    closingBalance[i] = openingBalance[i] + netCashFlowVals[i];
  }

  // ── Build P&L (from metadata) ──

  // Revenue groups (dynamic from revenue_group column)
  const otherIncomeSlugs = new Set(
    allIncomeCats.filter((c) => c.misClassification === "other_income").map((c) => c.slug)
  );
  const otherIncomeVals = addArrays(
    ...[...otherIncomeSlugs].map((s) => incomeBySlug.get(s) ?? emptyValues())
  );
  const totalRevenueVals = subtractArrays(totalIncomeVals, otherIncomeVals);

  // Build revenue groups by revenue_group value
  const revGroupMap = new Map<string, number[]>();
  for (const cat of allIncomeCats) {
    if (cat.misClassification !== "revenue") continue;
    const group = cat.revenueGroup ?? "other";
    const vals = incomeBySlug.get(cat.slug) ?? emptyValues();
    if (!revGroupMap.has(group)) revGroupMap.set(group, emptyValues());
    const g = revGroupMap.get(group)!;
    for (let i = 0; i < 12; i++) g[i] += vals[i];
  }

  const revenueGroups: MISLineItem[] = [];
  for (const [group, vals] of revGroupMap) {
    if (sumValues(vals) !== 0) {
      const label = `Revenue (${group.charAt(0).toUpperCase() + group.slice(1)})`;
      revenueGroups.push(makeLine(label, vals, group));
    }
  }

  // Direct & Indirect expenses from pnl_section metadata
  const directCats = [...topLevelExpCats.values()]
    .filter((c) => c.pnlSection === "direct")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const indirectCats = [...topLevelExpCats.values()]
    .filter((c) => c.pnlSection === "indirect")
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const pnlAccountedSlugs = new Set([
    ...directCats.map((c) => c.slug),
    ...indirectCats.map((c) => c.slug),
    ...[...topLevelExpCats.values()].filter((c) => c.pnlSection === "excluded").map((c) => c.slug),
  ]);

  const directExpenseItems: MISLineItem[] = [];
  for (const cat of directCats) {
    const vals = expenseBySlug.get(cat.slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      directExpenseItems.push(makeLine(expLabel(cat.slug), vals, cat.slug));
    }
  }
  const totalDirectVals = addArrays(...directExpenseItems.map((i) => i.values));

  const grossProfitVals = subtractArrays(totalRevenueVals, totalDirectVals);
  const grossProfitPctVals = pctArray(grossProfitVals, totalRevenueVals);

  const indirectExpenseItems: MISLineItem[] = [];
  for (const cat of indirectCats) {
    const vals = expenseBySlug.get(cat.slug) ?? emptyValues();
    if (sumValues(vals) !== 0) {
      indirectExpenseItems.push(makeLine(expLabel(cat.slug), vals, cat.slug));
    }
  }
  // Remaining unclassified categories go to indirect
  for (const [slug, vals] of expenseBySlug) {
    if (!pnlAccountedSlugs.has(slug) && sumValues(vals) !== 0) {
      indirectExpenseItems.push(makeLine(expLabel(slug), vals, slug));
    }
  }
  const totalIndirectVals = addArrays(...indirectExpenseItems.map((i) => i.values));

  const ebitdaVals = subtractArrays(
    addArrays(grossProfitVals, otherIncomeVals),
    totalIndirectVals
  );
  const ebitdaPctVals = pctArray(ebitdaVals, totalRevenueVals);

  // ── Build Drilldowns (from drilldown_mode metadata) ──

  function toSlug(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 60);
  }

  function buildDrilldown(source: Map<string, number[]>, totalLabel: string): { items: MISDrilldownItem[]; total: MISLineItem } {
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

  // Revenue by center
  const revByCenterResult = buildDrilldown(incomeByCenterName, "Total Revenue from Centres");

  // Dynamic drilldown sections from categories with drilldown_mode != 'none'
  const drilldownCats = [...topLevelExpCats.values()]
    .filter((c) => c.drilldownMode !== "none")
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const drilldownSections: MISDrilldownSection[] = [];
  for (const cat of drilldownCats) {
    const mode = cat.drilldownMode as "by_center" | "by_subcategory";
    const label = expLabel(cat.slug);
    let source: Map<string, number[]>;

    if (mode === "by_subcategory") {
      const children = expenseByParentChild.get(cat.slug) ?? new Map();
      source = children.size > 0 ? children : (expenseByCatCenter.get(cat.slug) ?? new Map());
    } else {
      source = expenseByCatCenter.get(cat.slug) ?? new Map();
    }

    const result = buildDrilldown(source, `Total ${label}`);
    if (result.items.length > 0) {
      drilldownSections.push({
        slug: cat.slug,
        label,
        mode,
        items: result.items,
        total: result.total,
      });
    }
  }

  return {
    months: labels,
    fyLabel,
    fyStartMonth,
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
      revenueGroups,
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
      sections: drilldownSections,
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

  const [settingsRow] = await db
    .select({ fyStartMonth: finjoeSettings.fyStartMonth })
    .from(finjoeSettings)
    .where(eq(finjoeSettings.tenantId, tenantId))
    .limit(1);
  const fyStartMonth = settingsRow?.fyStartMonth ?? 4;

  const { startDates, endDates } = fyMonths(fyStartYear, fyStartMonth);

  if (monthIdx < 0 || monthIdx > 11) return [];

  const monthStart = startDates[monthIdx];
  const monthEnd = endDates[monthIdx];

  if (type === "expense") {
    const cats = await db
      .select({ id: expenseCategories.id, slug: expenseCategories.slug, parentId: expenseCategories.parentId })
      .from(expenseCategories)
      .where(eq(expenseCategories.tenantId, tenantId));

    const targetId = cats.find((c) => c.slug === categorySlug)?.id;
    const matchIds = new Set<string>();
    if (targetId) {
      matchIds.add(targetId);
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
