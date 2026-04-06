/**
 * Shared types for CFO dashboard insights (no server imports — safe from worker/client).
 */

export type CfoMisPeriodSlicePayload = {
  fyLabel: string;
  periodStart: string;
  periodEnd: string;
  pnl: {
    totalRevenue: number;
    grossProfit: number;
    ebitda: number;
    topIndirectExpenses: Array<{ label: string; slug?: string; amount: number }>;
  };
  cashflow: {
    netOperating: number;
    netCashFlow: number;
  };
  drillHints: Array<{ sectionSlug: string; label: string; topItem: string; amount: number }>;
};

export type CfoInsightPayload = {
  period: { startDate: string; endDate: string };
  kpis: {
    totalExpenses: number;
    totalIncome: number;
    netCashflow: number;
    pendingApprovals: number;
    pettyCashAtRisk: number;
  };
  comparison: {
    expenseTrendPct: number;
    incomeTrendPct: number;
    prevTotalExpenses: number;
    prevTotalIncome: number;
  };
  topExpenseCategories: Array<{ name: string; amount: number }>;
  topCostCenters: Array<{ name: string; amount: number }>;
  cfoExtended: {
    expenseCategoryHhi: number;
    top3CategorySharePct: number;
    top3CostCenterSharePct: number;
    topVendors: Array<{ name: string; amount: number; sharePct: number }>;
    pendingApprovalAging: {
      count: number;
      avgDays: number | null;
      medianDays: number | null;
      countOver7Days: number;
      maxDays: number | null;
    };
  };
  mis: CfoMisPeriodSlicePayload | null;
};

export type CfoStructuredInsightResult = {
  narrative: string;
  keyPoints: string[];
  risks: string[];
  suggestedActions: string[];
  model: string;
};
