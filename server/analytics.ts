/**
 * Analytics aggregation for admin dashboard.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  expenses,
  expenseCategories,
  incomeRecords,
  incomeCategories,
  costCenters,
  pettyCashFunds,
  finJoeRoleChangeRequests,
} from "../shared/schema.js";
import { generateGeminiPredictions } from "../lib/analytics-insights.js";

function toDateKey(d: Date, tz: "utc" | "local" = "local"): string {
  if (tz === "utc") return d.toISOString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type AnalyticsFilters = {
  tenantId: string;
  startDate: string;
  endDate: string;
  costCenterId?: string | null;
  granularity?: "day" | "week" | "month";
};

function buildExpenseConditions(tid: string, filters: AnalyticsFilters) {
  const conditions = [
    eq(expenses.tenantId, tid),
    sql`${expenses.expenseDate} >= ${filters.startDate}::date`,
    sql`${expenses.expenseDate} <= ${filters.endDate}::date`,
  ];
  const ccId = filters.costCenterId;
  if (ccId && ccId !== "all" && ccId !== "null" && ccId !== "__corporate__") {
    conditions.push(eq(expenses.costCenterId, ccId));
  } else if (ccId === "null" || ccId === "__corporate__") {
    conditions.push(sql`${expenses.costCenterId} IS NULL`);
  }
  return and(...conditions);
}

function buildIncomeConditions(tid: string, filters: AnalyticsFilters) {
  const conditions = [
    eq(incomeRecords.tenantId, tid),
    sql`${incomeRecords.incomeDate} >= ${filters.startDate}::date`,
    sql`${incomeRecords.incomeDate} <= ${filters.endDate}::date`,
  ];
  const ccId = filters.costCenterId;
  if (ccId && ccId !== "all" && ccId !== "null" && ccId !== "__corporate__") {
    conditions.push(eq(incomeRecords.costCenterId, ccId));
  } else if (ccId === "null" || ccId === "__corporate__") {
    conditions.push(sql`${incomeRecords.costCenterId} IS NULL`);
  }
  return and(...conditions);
}

export async function getAnalytics(filters: AnalyticsFilters) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(filters.startDate) || !dateRegex.test(filters.endDate)) {
    throw new Error("startDate and endDate must be YYYY-MM-DD");
  }
  if (filters.startDate > filters.endDate) {
    throw new Error("startDate must be before or equal to endDate");
  }

  const tid = filters.tenantId;
  const whereExpense = buildExpenseConditions(tid, filters);
  const whereIncome = buildIncomeConditions(tid, filters);

  const expenseRows = await db
    .select({
      amount: expenses.amount,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      categoryId: expenses.categoryId,
      costCenterId: expenses.costCenterId,
      categoryName: expenseCategories.name,
      costCenterName: costCenters.name,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
    .where(whereExpense);

  const incomeRows = await db
    .select({
      amount: incomeRecords.amount,
      incomeDate: incomeRecords.incomeDate,
      categoryId: incomeRecords.categoryId,
      categoryName: incomeCategories.name,
    })
    .from(incomeRecords)
    .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
    .where(whereIncome);

  const [pendingApprovals] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(eq(expenses.status, "pending_approval"), eq(expenses.tenantId, tid)));

  const [pendingRoleReqs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(finJoeRoleChangeRequests)
    .where(and(eq(finJoeRoleChangeRequests.status, "pending"), eq(finJoeRoleChangeRequests.tenantId, tid)));

  const pettyCashRows = await db
    .select({
      imprestAmount: pettyCashFunds.imprestAmount,
      currentBalance: pettyCashFunds.currentBalance,
      costCenterName: costCenters.name,
    })
    .from(pettyCashFunds)
    .leftJoin(costCenters, eq(pettyCashFunds.costCenterId, costCenters.id))
    .where(eq(pettyCashFunds.tenantId, tid));

  const totalExpenses = expenseRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalIncome = incomeRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const pettyCashAtRisk = pettyCashRows.filter(
    (r) => r.imprestAmount > 0 && (r.currentBalance ?? 0) < r.imprestAmount * 0.2
  ).length;

  const expensesByStatus: Record<string, { amount: number; count: number }> = {};
  for (const r of expenseRows) {
    const s = r.status ?? "unknown";
    if (!expensesByStatus[s]) expensesByStatus[s] = { amount: 0, count: 0 };
    expensesByStatus[s].amount += r.amount ?? 0;
    expensesByStatus[s].count += 1;
  }

  const expensesByCategory: Array<{ name: string; amount: number; count: number }> = [];
  const catMap: Record<string, { amount: number; count: number }> = {};
  for (const r of expenseRows) {
    const name = r.categoryName ?? "Uncategorized";
    if (!catMap[name]) catMap[name] = { amount: 0, count: 0 };
    catMap[name].amount += r.amount ?? 0;
    catMap[name].count += 1;
  }
  for (const [name, v] of Object.entries(catMap)) {
    expensesByCategory.push({ name, amount: v.amount, count: v.count });
  }
  expensesByCategory.sort((a, b) => b.amount - a.amount);

  const expensesByCostCenter: Array<{ name: string; amount: number; count: number }> = [];
  const ccMap: Record<string, { amount: number; count: number }> = {};
  for (const r of expenseRows) {
    const name = r.costCenterName ?? "Corporate Office";
    if (!ccMap[name]) ccMap[name] = { amount: 0, count: 0 };
    ccMap[name].amount += r.amount ?? 0;
    ccMap[name].count += 1;
  }
  for (const [name, v] of Object.entries(ccMap)) {
    expensesByCostCenter.push({ name, amount: v.amount, count: v.count });
  }
  expensesByCostCenter.sort((a, b) => b.amount - a.amount);

  const incomeByCategory: Array<{ name: string; amount: number; count: number }> = [];
  const incCatMap: Record<string, { amount: number; count: number }> = {};
  for (const r of incomeRows) {
    const name = r.categoryName ?? "Uncategorized";
    if (!incCatMap[name]) incCatMap[name] = { amount: 0, count: 0 };
    incCatMap[name].amount += r.amount ?? 0;
    incCatMap[name].count += 1;
  }
  for (const [name, v] of Object.entries(incCatMap)) {
    incomeByCategory.push({ name, amount: v.amount, count: v.count });
  }
  incomeByCategory.sort((a, b) => b.amount - a.amount);

  const granularity = filters.granularity ?? "day";
  const timeSeries: Array<{ date: string; expenses: number; income: number }> = [];
  const seriesMap: Record<string, { expenses: number; income: number }> = {};

  for (const r of expenseRows) {
    const d = new Date(r.expenseDate);
    let key: string;
    if (granularity === "day") key = toDateKey(d, "local");
    else if (granularity === "week") key = getWeekKey(d);
    else key = d.toISOString().slice(0, 7);
    if (!seriesMap[key]) seriesMap[key] = { expenses: 0, income: 0 };
    seriesMap[key].expenses += r.amount ?? 0;
  }
  for (const r of incomeRows) {
    const d = new Date(r.incomeDate);
    let key: string;
    if (granularity === "day") key = toDateKey(d, "local");
    else if (granularity === "week") key = getWeekKey(d);
    else key = d.toISOString().slice(0, 7);
    if (!seriesMap[key]) seriesMap[key] = { expenses: 0, income: 0 };
    seriesMap[key].income += r.amount ?? 0;
  }
  for (const [date, v] of Object.entries(seriesMap).sort((a, b) => a[0].localeCompare(b[0]))) {
    timeSeries.push({ date, expenses: v.expenses, income: v.income });
  }

  const periodDays = Math.ceil(
    (new Date(filters.endDate).getTime() - new Date(filters.startDate).getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;
  const prevStart = new Date(filters.startDate);
  prevStart.setDate(prevStart.getDate() - periodDays);
  const prevEnd = new Date(filters.startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevFilters: AnalyticsFilters = {
    ...filters,
    startDate: prevStart.toISOString().slice(0, 10),
    endDate: prevEnd.toISOString().slice(0, 10),
  };
  const prevWhereExpense = buildExpenseConditions(tid, prevFilters);
  const prevWhereIncome = buildIncomeConditions(tid, prevFilters);
  const [prevExpenseSum] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(prevWhereExpense);
  const [prevIncomeSum] = await db
    .select({ total: sql<number>`coalesce(sum(${incomeRecords.amount}), 0)::int` })
    .from(incomeRecords)
    .where(prevWhereIncome);
  const prevTotalExpenses = prevExpenseSum?.total ?? 0;
  const prevTotalIncome = prevIncomeSum?.total ?? 0;

  return {
    kpis: {
      totalExpenses,
      totalIncome,
      netCashflow: totalIncome - totalExpenses,
      pendingApprovals: pendingApprovals?.count ?? 0,
      pendingRoleRequests: pendingRoleReqs?.count ?? 0,
      pettyCashAtRisk,
    },
    expensesByStatus,
    expensesByCategory: expensesByCategory.slice(0, 10),
    expensesByCostCenter: expensesByCostCenter.slice(0, 10),
    incomeByCategory: incomeByCategory.slice(0, 10),
    timeSeries,
    comparison: {
      prevTotalExpenses,
      prevTotalIncome,
      prevNetCashflow: prevTotalIncome - prevTotalExpenses,
      expenseTrend: prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0,
      incomeTrend: prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0,
    },
  };
}

function getWeekKey(d: Date): string {
  const start = new Date(d);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  return start.toISOString().slice(0, 10);
}

export type PredictionsFilters = {
  tenantId: string;
  horizonDays?: number;
  costCenterId?: string | null;
};

function computeMape(actual: number[], predicted: number[]): number | null {
  if (!actual.length || actual.length !== predicted.length) return null;
  let sumPct = 0;
  let used = 0;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i] ?? 0;
    const p = predicted[i] ?? 0;
    if (a <= 0) continue;
    sumPct += Math.abs((a - p) / a) * 100;
    used += 1;
  }
  if (used === 0) return null;
  return Number((sumPct / used).toFixed(1));
}

function normalizeCostCenterId(costCenterId?: string | null): string | null | undefined {
  if (costCenterId == null || costCenterId === "" || costCenterId === "all") return undefined;
  if (costCenterId === "__corporate__") return "null";
  return costCenterId;
}

function addCostCenterCondition(conditions: any[], ccId: string | null | undefined, column: any) {
  if (!ccId) return;
  if (ccId === "null") {
    conditions.push(sql`${column} IS NULL`);
    return;
  }
  conditions.push(eq(column, ccId));
}

function toMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeGeminiPrediction(
  rawPrediction: Record<string, unknown>,
  horizonDays: number,
  startingBalance: number,
  fallback: {
    expenseForecast: Array<{ date: string; amount: number }>;
    incomeForecast: Array<{ date: string; amount: number }>;
    cashflowForecast: Array<{ date: string; netPosition: number }>;
    cashRequiredNextWeek: number;
    cashRequiredHorizon: number;
    forecastRange: { min: number; max: number };
    confidence: "low" | "medium" | "high";
    driverFactors: string[];
    alerts: Array<{ type: string; message: string }>;
    model: string;
  }
) {
  const expenseRows = Array.isArray(rawPrediction.expenseForecast) ? (rawPrediction.expenseForecast as Array<Record<string, unknown>>) : [];
  const incomeRows = Array.isArray(rawPrediction.incomeForecast) ? (rawPrediction.incomeForecast as Array<Record<string, unknown>>) : [];
  const normalizedExpenseForecast: Array<{ date: string; amount: number }> = [];
  const normalizedIncomeForecast: Array<{ date: string; amount: number }> = [];
  for (let i = 0; i < horizonDays; i++) {
    const fallbackExpense = fallback.expenseForecast[i];
    const fallbackIncome = fallback.incomeForecast[i];
    const e = expenseRows[i];
    const inc = incomeRows[i];
    normalizedExpenseForecast.push({
      date: typeof e?.date === "string" ? e.date : fallbackExpense.date,
      amount: Number.isFinite(e?.amount as number)
        ? Math.max(0, Math.round(Number(e?.amount)))
        : fallbackExpense.amount,
    });
    normalizedIncomeForecast.push({
      date: typeof inc?.date === "string" ? inc.date : fallbackIncome.date,
      amount: Number.isFinite(inc?.amount as number)
        ? Math.max(0, Math.round(Number(inc?.amount)))
        : fallbackIncome.amount,
    });
  }

  const normalizedCashflowForecast: Array<{ date: string; netPosition: number }> = [];
  let runningNet = startingBalance;
  for (let i = 0; i < horizonDays; i++) {
    runningNet += normalizedIncomeForecast[i].amount - normalizedExpenseForecast[i].amount;
    normalizedCashflowForecast.push({
      date: normalizedExpenseForecast[i].date,
      netPosition: Math.round(runningNet),
    });
  }

  const minNet = Math.min(...normalizedCashflowForecast.map((r) => r.netPosition));
  const maxNet = Math.max(...normalizedCashflowForecast.map((r) => r.netPosition));
  const computedCashRequiredNextWeek = Math.max(0, ...normalizedCashflowForecast.slice(0, 7).map((r) => -r.netPosition));
  const computedCashRequiredHorizon = Math.max(0, ...normalizedCashflowForecast.map((r) => -r.netPosition));

  const rawRange = rawPrediction.forecastRange as { min?: unknown; max?: unknown } | undefined;
  const rawMin = Number(rawRange?.min);
  const rawMax = Number(rawRange?.max);
  const range = Number.isFinite(rawMin) && Number.isFinite(rawMax)
    ? { min: Math.min(rawMin, rawMax), max: Math.max(rawMin, rawMax) }
    : { min: minNet, max: maxNet };

  const confidenceRaw = rawPrediction.confidence;
  const confidence = confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high"
    ? confidenceRaw
    : fallback.confidence;

  const driverFactors = Array.isArray(rawPrediction.driverFactors)
    ? (rawPrediction.driverFactors as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 6)
    : fallback.driverFactors;

  const alerts = Array.isArray(rawPrediction.alerts)
    ? (rawPrediction.alerts as Array<Record<string, unknown>>)
        .map((a) => ({
          type: String(a.type ?? "").trim(),
          message: String(a.message ?? "").trim(),
        }))
        .filter((a) => !!a.type && !!a.message)
        .slice(0, 8)
    : fallback.alerts;

  return {
    expenseForecast: normalizedExpenseForecast,
    incomeForecast: normalizedIncomeForecast,
    cashflowForecast: normalizedCashflowForecast,
    cashRequiredNextWeek: Math.round(
      Number.isFinite(rawPrediction.cashRequiredNextWeek as number)
        ? Math.max(0, Number(rawPrediction.cashRequiredNextWeek))
        : computedCashRequiredNextWeek
    ),
    cashRequiredHorizon: Math.round(
      Number.isFinite(rawPrediction.cashRequiredHorizon as number)
        ? Math.max(0, Number(rawPrediction.cashRequiredHorizon))
        : computedCashRequiredHorizon
    ),
    forecastRange: range,
    confidence,
    driverFactors: driverFactors.length ? driverFactors : fallback.driverFactors,
    alerts: alerts.length ? alerts : fallback.alerts,
    model: typeof rawPrediction.model === "string" && rawPrediction.model.trim() ? rawPrediction.model : fallback.model,
  };
}

export async function getPredictions(filters: PredictionsFilters) {
  const tid = filters.tenantId;
  const horizonDays = Math.min(90, Math.max(1, filters.horizonDays ?? 30));
  const normalizedCostCenterId = normalizeCostCenterId(filters.costCenterId);

  const lookbackEnd = new Date();
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - 90);
  const geminiContextStart = new Date();
  geminiContextStart.setDate(geminiContextStart.getDate() - 365);

  const expenseConditions = [
    eq(expenses.tenantId, tid),
    sql`${expenses.expenseDate} >= ${lookbackStart.toISOString().slice(0, 10)}::date`,
    sql`${expenses.expenseDate} <= ${lookbackEnd.toISOString().slice(0, 10)}::date`,
  ];
  addCostCenterCondition(expenseConditions, normalizedCostCenterId, expenses.costCenterId);

  const expenseRows = await db
    .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(and(...expenseConditions));

  const incomeConditions = [
    eq(incomeRecords.tenantId, tid),
    sql`${incomeRecords.incomeDate} >= ${lookbackStart.toISOString().slice(0, 10)}::date`,
    sql`${incomeRecords.incomeDate} <= ${lookbackEnd.toISOString().slice(0, 10)}::date`,
  ];
  addCostCenterCondition(incomeConditions, normalizedCostCenterId, incomeRecords.costCenterId);

  const incomeRows = await db
    .select({ amount: incomeRecords.amount, incomeDate: incomeRecords.incomeDate })
    .from(incomeRecords)
    .where(and(...incomeConditions));

  const geminiExpenseConditions = [
    eq(expenses.tenantId, tid),
    sql`${expenses.expenseDate} >= ${geminiContextStart.toISOString().slice(0, 10)}::date`,
    sql`${expenses.expenseDate} <= ${lookbackEnd.toISOString().slice(0, 10)}::date`,
  ];
  addCostCenterCondition(geminiExpenseConditions, normalizedCostCenterId, expenses.costCenterId);

  const geminiExpenseRows = await db
    .select({
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
      categoryName: expenseCategories.name,
      costCenterName: costCenters.name,
      description: expenses.description,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(costCenters, eq(expenses.costCenterId, costCenters.id))
    .where(and(...geminiExpenseConditions));

  const geminiIncomeConditions = [
    eq(incomeRecords.tenantId, tid),
    sql`${incomeRecords.incomeDate} >= ${geminiContextStart.toISOString().slice(0, 10)}::date`,
    sql`${incomeRecords.incomeDate} <= ${lookbackEnd.toISOString().slice(0, 10)}::date`,
  ];
  addCostCenterCondition(geminiIncomeConditions, normalizedCostCenterId, incomeRecords.costCenterId);

  const geminiIncomeRows = await db
    .select({
      amount: incomeRecords.amount,
      incomeDate: incomeRecords.incomeDate,
      categoryName: incomeCategories.name,
      costCenterName: costCenters.name,
      particulars: incomeRecords.particulars,
    })
    .from(incomeRecords)
    .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
    .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
    .where(and(...geminiIncomeConditions));

  const dailyExpenses: Record<string, number> = {};
  for (const r of expenseRows) {
    const key = toDateKey(new Date(r.expenseDate), "local");
    dailyExpenses[key] = (dailyExpenses[key] ?? 0) + (r.amount ?? 0);
  }
  const sortedExpenseDates = Object.keys(dailyExpenses).sort();
  const dailyExpenseValues = sortedExpenseDates.map((d) => dailyExpenses[d] ?? 0);
  const avgDailyExpense =
    dailyExpenseValues.length > 0 ? dailyExpenseValues.reduce((a, b) => a + b, 0) / dailyExpenseValues.length : 0;

  const dailyIncome: Record<string, number> = {};
  for (const r of incomeRows) {
    const key = toDateKey(new Date(r.incomeDate), "local");
    dailyIncome[key] = (dailyIncome[key] ?? 0) + (r.amount ?? 0);
  }
  const dailyIncomeValues = Object.values(dailyIncome);
  const avgDailyIncome =
    dailyIncomeValues.length > 0 ? dailyIncomeValues.reduce((a, b) => a + b, 0) / dailyIncomeValues.length : 0;

  // Backtest telemetry: predict last 7 days using prior 28-day average.
  const backtestDays = 7;
  const trainDays = 28;
  const expenseSeries: Array<{ date: Date; amount: number }> = Object.entries(dailyExpenses)
    .map(([k, v]) => ({ date: new Date(k), amount: v }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const incomeSeries: Array<{ date: Date; amount: number }> = Object.entries(dailyIncome)
    .map(([k, v]) => ({ date: new Date(k), amount: v }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const expenseBacktestWindow = expenseSeries.slice(-(trainDays + backtestDays));
  const incomeBacktestWindow = incomeSeries.slice(-(trainDays + backtestDays));
  const trainExpense = expenseBacktestWindow.slice(0, Math.max(0, expenseBacktestWindow.length - backtestDays));
  const testExpense = expenseBacktestWindow.slice(-backtestDays);
  const trainIncome = incomeBacktestWindow.slice(0, Math.max(0, incomeBacktestWindow.length - backtestDays));
  const testIncome = incomeBacktestWindow.slice(-backtestDays);
  const trainExpenseAvg = trainExpense.length ? trainExpense.reduce((s, r) => s + r.amount, 0) / trainExpense.length : 0;
  const trainIncomeAvg = trainIncome.length ? trainIncome.reduce((s, r) => s + r.amount, 0) / trainIncome.length : 0;
  const expenseMape7d = computeMape(
    testExpense.map((r) => r.amount),
    testExpense.map(() => trainExpenseAvg)
  );
  const incomeMape7d = computeMape(
    testIncome.map((r) => r.amount),
    testIncome.map(() => trainIncomeAvg)
  );
  const overallMape7d =
    expenseMape7d != null && incomeMape7d != null
      ? Number(((expenseMape7d + incomeMape7d) / 2).toFixed(1))
      : expenseMape7d ?? incomeMape7d;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateKey(yesterday, "local");
  // Cumulative cash position as of yesterday: all-time income minus all paid expenses through yesterday
  const [incomeSum] = await db
    .select({ total: sql<number>`coalesce(sum(${incomeRecords.amount}), 0)::int` })
    .from(incomeRecords)
    .where(
      and(
        eq(incomeRecords.tenantId, tid),
        sql`${incomeRecords.incomeDate} <= ${yesterdayStr}::date`,
        ...(normalizedCostCenterId === "null"
          ? [sql`${incomeRecords.costCenterId} IS NULL`]
          : normalizedCostCenterId
            ? [eq(incomeRecords.costCenterId, normalizedCostCenterId)]
            : [])
      )
    );
  const [paidExpenseSum] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::int` })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tid),
        eq(expenses.status, "paid"),
        sql`${expenses.expenseDate} <= ${yesterdayStr}::date`,
        ...(normalizedCostCenterId === "null"
          ? [sql`${expenses.costCenterId} IS NULL`]
          : normalizedCostCenterId
            ? [eq(expenses.costCenterId, normalizedCostCenterId)]
            : [])
      )
    );
  const startingBalance = (incomeSum?.total ?? 0) - (paidExpenseSum?.total ?? 0);

  const expenseForecast: Array<{ date: string; amount: number }> = [];
  const incomeForecast: Array<{ date: string; amount: number }> = [];
  const cashflowForecast: Array<{ date: string; netPosition: number }> = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let runningNet = startingBalance;

  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    expenseForecast.push({ date: dateStr, amount: Math.round(avgDailyExpense) });
    incomeForecast.push({ date: dateStr, amount: Math.round(avgDailyIncome) });
    runningNet += avgDailyIncome - avgDailyExpense;
    cashflowForecast.push({ date: dateStr, netPosition: Math.round(runningNet) });
  }

  const pettyCashRows = await db
    .select({
      imprestAmount: pettyCashFunds.imprestAmount,
      currentBalance: pettyCashFunds.currentBalance,
      costCenterName: costCenters.name,
    })
    .from(pettyCashFunds)
    .leftJoin(costCenters, eq(pettyCashFunds.costCenterId, costCenters.id))
    .where(
      and(
        eq(pettyCashFunds.tenantId, tid),
        ...(normalizedCostCenterId === "null"
          ? [sql`${pettyCashFunds.costCenterId} IS NULL`]
          : normalizedCostCenterId
            ? [eq(pettyCashFunds.costCenterId, normalizedCostCenterId)]
            : [])
      )
    );

  const alerts: Array<{ type: string; message: string }> = [];
  for (const r of pettyCashRows) {
    if (r.imprestAmount > 0 && (r.currentBalance ?? 0) < r.imprestAmount * 0.2) {
      alerts.push({
        type: "petty_cash_low",
        message: `Petty cash at ${r.costCenterName ?? "Unknown"} may run low (${r.currentBalance ?? 0} of ${r.imprestAmount} imprest)`,
      });
    }
  }

  const pendingExpenses = await db
    .select({ submittedAt: expenses.submittedAt })
    .from(expenses)
    .where(
      and(
        eq(expenses.status, "pending_approval"),
        eq(expenses.tenantId, tid),
        ...(normalizedCostCenterId === "null"
          ? [sql`${expenses.costCenterId} IS NULL`]
          : normalizedCostCenterId
            ? [eq(expenses.costCenterId, normalizedCostCenterId)]
            : [])
      )
    );
  const now = Date.now();
  const staleThreshold = 7 * 24 * 60 * 60 * 1000;
  for (const r of pendingExpenses) {
    const submitted = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
    if (submitted && now - submitted > staleThreshold) {
      alerts.push({
        type: "pending_approval_stale",
        message: `Expenses pending approval for more than 7 days`,
      });
      break;
    }
  }

  let last7Sum = 0;
  let prev7Sum = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7Sum += dailyExpenses[toDateKey(d, "local")] ?? 0;
  }
  for (let i = 8; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    prev7Sum += dailyExpenses[toDateKey(d, "local")] ?? 0;
  }
  if (prev7Sum >= 1000 && last7Sum > prev7Sum * 1.5) {
    alerts.push({
      type: "expense_spike",
      message: `Expense spike detected: last 7 calendar days (₹${Math.round(last7Sum).toLocaleString("en-IN")}) is >150% of prior 7 days`,
    });
  }

  // Unusually large single expense (last 30 days): >3x median
  const last30Expenses = expenseRows
    .filter((r) => {
      const d = new Date(r.expenseDate);
      const diff = (today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
      return diff >= 0 && diff <= 30;
    })
    .map((r) => r.amount ?? 0)
    .filter((a) => a > 0);
  if (last30Expenses.length >= 5) {
    const sorted = [...last30Expenses].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const large = last30Expenses.filter((a) => a > median * 3);
    if (large.length > 0) {
      const maxAmt = Math.max(...large);
      alerts.push({
        type: "unusual_expense",
        message: `Unusually large expense detected: ₹${maxAmt.toLocaleString("en-IN")} (${large.length} expense(s) >3× median)`,
      });
    }
  }

  // Negative cashflow forecast
  const minForecast = Math.min(...cashflowForecast.map((c) => c.netPosition));
  if (minForecast < 0 && startingBalance > 0) {
    alerts.push({
      type: "negative_forecast",
      message: `Cash flow forecast may go negative in the next ${horizonDays} days based on current trends`,
    });
  }

  const deterministicCashRequiredNextWeek = Math.max(
    0,
    ...cashflowForecast.slice(0, 7).map((c) => -c.netPosition)
  );
  const deterministicCashRequiredHorizon = Math.max(
    0,
    ...cashflowForecast.map((c) => -c.netPosition)
  );
  const deterministicRange = {
    min: Math.min(...cashflowForecast.map((c) => c.netPosition)),
    max: Math.max(...cashflowForecast.map((c) => c.netPosition)),
  };

  const fallbackPrediction = {
    expenseForecast,
    incomeForecast,
    cashflowForecast,
    cashRequiredNextWeek: Math.round(deterministicCashRequiredNextWeek),
    cashRequiredHorizon: Math.round(deterministicCashRequiredHorizon),
    forecastRange: deterministicRange,
    confidence: "medium" as const,
    driverFactors: [
      "Average daily expense trend",
      "Average daily income trend",
      "Starting balance and paid-expense history",
    ],
    alerts,
    model: "deterministic-fallback",
  };

  // Build bounded context for Gemini: capped daily points + compressed monthly summaries.
  const expenseDailyMap: Record<string, number> = {};
  for (const r of geminiExpenseRows) {
    const key = toDateKey(new Date(r.expenseDate), "local");
    expenseDailyMap[key] = (expenseDailyMap[key] ?? 0) + (r.amount ?? 0);
  }
  const incomeDailyMap: Record<string, number> = {};
  for (const r of geminiIncomeRows) {
    const key = toDateKey(new Date(r.incomeDate), "local");
    incomeDailyMap[key] = (incomeDailyMap[key] ?? 0) + (r.amount ?? 0);
  }
  const expenseTransactions = Object.entries(expenseDailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-180)
    .map(([date, amount]) => ({ date, amount }));
  const incomeTransactions = Object.entries(incomeDailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-180)
    .map(([date, amount]) => ({ date, amount }));

  const monthlyExpenseTotals = Object.entries(
    geminiExpenseRows.reduce<Record<string, number>>((acc, r) => {
      const month = toMonthKey(new Date(r.expenseDate));
      acc[month] = (acc[month] ?? 0) + (r.amount ?? 0);
      return acc;
    }, {})
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-18)
    .map(([month, amount]) => ({ month, amount: Math.round(amount) }));

  const monthlyIncomeTotals = Object.entries(
    geminiIncomeRows.reduce<Record<string, number>>((acc, r) => {
      const month = toMonthKey(new Date(r.incomeDate));
      acc[month] = (acc[month] ?? 0) + (r.amount ?? 0);
      return acc;
    }, {})
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-18)
    .map(([month, amount]) => ({ month, amount: Math.round(amount) }));

  const topExpenseCategories = Object.entries(
    geminiExpenseRows.reduce<Record<string, number>>((acc, r) => {
      const key = r.categoryName ?? "Uncategorized";
      acc[key] = (acc[key] ?? 0) + (r.amount ?? 0);
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }));

  const topIncomeCategories = Object.entries(
    geminiIncomeRows.reduce<Record<string, number>>((acc, r) => {
      const key = r.categoryName ?? "Uncategorized";
      acc[key] = (acc[key] ?? 0) + (r.amount ?? 0);
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }));

  const geminiPrediction = await generateGeminiPredictions({
    horizonDays,
    startingBalance,
    expenseTransactions,
    incomeTransactions,
    contextSummary: {
      monthlyExpenseTotals,
      monthlyIncomeTotals,
      topExpenseCategories,
      topIncomeCategories,
    },
  });

  if (geminiPrediction) {
    const gp = geminiPrediction as Record<string, unknown>;
    const hasCoreArrays =
      Array.isArray(gp.expenseForecast) &&
      Array.isArray(gp.incomeForecast) &&
      Array.isArray(gp.cashflowForecast);
    if (!hasCoreArrays) {
      console.warn("[analytics] Invalid Gemini prediction shape; falling back to deterministic forecast");
    } else {
    const normalized = normalizeGeminiPrediction(
      geminiPrediction as unknown as Record<string, unknown>,
      horizonDays,
      startingBalance,
      fallbackPrediction
    );
    return {
      ...normalized,
      avgDailyExpense: Math.round(avgDailyExpense),
      avgDailyIncome: Math.round(avgDailyIncome),
      startingBalance,
      accuracyTelemetry: {
        method: "rolling-average-backtest",
        backtestDays,
        trainingDays: trainDays,
        expenseMape7d,
        incomeMape7d,
        overallMape7d,
      },
      engine: "gemini",
    };
    }
  }

  return {
    ...fallbackPrediction,
    avgDailyExpense: Math.round(avgDailyExpense),
    avgDailyIncome: Math.round(avgDailyIncome),
    startingBalance,
    accuracyTelemetry: {
      method: "rolling-average-backtest",
      backtestDays,
      trainingDays: trainDays,
      expenseMape7d,
      incomeMape7d,
      overallMape7d,
    },
    engine: "fallback",
  };
}
