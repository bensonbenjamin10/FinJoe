/**
 * Build CFO insight payload for Gemini from analytics + optional MIS slice (shared by API and cron).
 */

import type { CfoInsightPayload } from "../lib/cfo-insight-types.js";
import type { CfoExtendedMetrics } from "./analytics.js";
import type { MisPeriodSlice } from "./mis-period-slice.js";

type AnalyticsBundle = {
  kpis: {
    totalExpenses: number;
    totalIncome: number;
    netCashflow: number;
    pendingApprovals: number;
    pettyCashAtRisk: number;
  };
  comparison: {
    expenseTrend: number;
    incomeTrend: number;
    prevTotalExpenses: number;
    prevTotalIncome: number;
  };
  expensesByCategory: Array<{ name: string; amount: number }>;
  expensesByCostCenter: Array<{ name: string; amount: number }>;
  cfoExtended: CfoExtendedMetrics;
};

export function buildCfoInsightPayload(
  startDate: string,
  endDate: string,
  data: AnalyticsBundle,
  misSlice: MisPeriodSlice | null
): CfoInsightPayload {
  const cfoExtended = data.cfoExtended;
  return {
    period: { startDate, endDate },
    kpis: {
      totalExpenses: data.kpis.totalExpenses,
      totalIncome: data.kpis.totalIncome,
      netCashflow: data.kpis.netCashflow,
      pendingApprovals: data.kpis.pendingApprovals,
      pettyCashAtRisk: data.kpis.pettyCashAtRisk,
    },
    comparison: {
      expenseTrendPct: data.comparison.expenseTrend,
      incomeTrendPct: data.comparison.incomeTrend,
      prevTotalExpenses: data.comparison.prevTotalExpenses,
      prevTotalIncome: data.comparison.prevTotalIncome,
    },
    topExpenseCategories: (data.expensesByCategory ?? []).slice(0, 8).map((c) => ({ name: c.name, amount: c.amount })),
    topCostCenters: (data.expensesByCostCenter ?? []).slice(0, 8).map((c) => ({ name: c.name, amount: c.amount })),
    cfoExtended,
    mis: misSlice
      ? {
          fyLabel: misSlice.fyLabel,
          periodStart: misSlice.periodStart,
          periodEnd: misSlice.periodEnd,
          pnl: misSlice.pnl,
          cashflow: misSlice.cashflow,
          drillHints: misSlice.drillHints,
        }
      : null,
  };
}
