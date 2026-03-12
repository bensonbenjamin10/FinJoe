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
    if (granularity === "day") key = d.toISOString().slice(0, 10);
    else if (granularity === "week") key = getWeekKey(d);
    else key = d.toISOString().slice(0, 7);
    if (!seriesMap[key]) seriesMap[key] = { expenses: 0, income: 0 };
    seriesMap[key].expenses += r.amount ?? 0;
  }
  for (const r of incomeRows) {
    const d = new Date(r.incomeDate);
    let key: string;
    if (granularity === "day") key = d.toISOString().slice(0, 10);
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
};

export async function getPredictions(filters: PredictionsFilters) {
  const tid = filters.tenantId;
  const horizonDays = filters.horizonDays ?? 30;

  const lookbackEnd = new Date();
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - 90);

  const expenseRows = await db
    .select({ amount: expenses.amount, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tid),
        sql`${expenses.expenseDate} >= ${lookbackStart.toISOString().slice(0, 10)}::date`,
        sql`${expenses.expenseDate} <= ${lookbackEnd.toISOString().slice(0, 10)}::date`
      )
    );

  const incomeRows = await db
    .select({ amount: incomeRecords.amount, incomeDate: incomeRecords.incomeDate })
    .from(incomeRecords)
    .where(
      and(
        eq(incomeRecords.tenantId, tid),
        sql`${incomeRecords.incomeDate} >= ${lookbackStart.toISOString().slice(0, 10)}::date`,
        sql`${incomeRecords.incomeDate} <= ${lookbackEnd.toISOString().slice(0, 10)}::date`
      )
    );

  const dailyExpenses: Record<string, number> = {};
  for (const r of expenseRows) {
    const key = new Date(r.expenseDate).toISOString().slice(0, 10);
    dailyExpenses[key] = (dailyExpenses[key] ?? 0) + (r.amount ?? 0);
  }
  const dailyExpenseValues = Object.values(dailyExpenses);
  const avgDailyExpense =
    dailyExpenseValues.length > 0 ? dailyExpenseValues.reduce((a, b) => a + b, 0) / dailyExpenseValues.length : 0;

  const dailyIncome: Record<string, number> = {};
  for (const r of incomeRows) {
    const key = new Date(r.incomeDate).toISOString().slice(0, 10);
    dailyIncome[key] = (dailyIncome[key] ?? 0) + (r.amount ?? 0);
  }
  const dailyIncomeValues = Object.values(dailyIncome);
  const avgDailyIncome =
    dailyIncomeValues.length > 0 ? dailyIncomeValues.reduce((a, b) => a + b, 0) / dailyIncomeValues.length : 0;

  const expenseForecast: Array<{ date: string; amount: number }> = [];
  const incomeForecast: Array<{ date: string; amount: number }> = [];
  const cashflowForecast: Array<{ date: string; netPosition: number }> = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let runningNet = 0;

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
    .where(eq(pettyCashFunds.tenantId, tid));

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
    .where(and(eq(expenses.status, "pending_approval"), eq(expenses.tenantId, tid)));
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

  if (dailyExpenseValues.length >= 14) {
    const last7 = dailyExpenseValues.slice(-7);
    const prev7 = dailyExpenseValues.slice(-14, -7);
    const last7Avg = last7.reduce((a, b) => a + b, 0) / 7;
    const prev7Avg = prev7.reduce((a, b) => a + b, 0) / 7;
    if (prev7Avg > 0 && last7Avg > prev7Avg * 1.5) {
      alerts.push({
        type: "expense_spike",
        message: `Expense spike detected: last 7 days (${Math.round(last7Avg)}/day avg) is >150% of prior 7 days`,
      });
    }
  }

  return {
    expenseForecast,
    incomeForecast,
    cashflowForecast,
    alerts,
    avgDailyExpense: Math.round(avgDailyExpense),
    avgDailyIncome: Math.round(avgDailyIncome),
  };
}
