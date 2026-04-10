/**
 * Deterministic financial health test engine.
 * Runs 15 industry-standard tests (Big 4 / FP&A frameworks) on analytics + MIS data.
 * Pure computation — no LLM calls. Fast and reproducible.
 */

import type {
  CfoInsightPayload,
  CfoMisPeriodSlicePayload,
  HealthTestResult,
  HealthTestScore,
  FinancialHealthReport,
} from "../lib/cfo-insight-types.js";

function score(pass: boolean, warn: boolean): HealthTestScore {
  if (pass) return "pass";
  if (warn) return "warn";
  return "fail";
}

function fmtInr(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

export function runFinancialHealthTests(
  payload: CfoInsightPayload,
): FinancialHealthReport {
  const tests: HealthTestResult[] = [];
  const { kpis, comparison, cfoExtended, mis } = payload;
  const days = daysBetween(payload.period.startDate, payload.period.endDate);
  const months = Math.max(1, days / 30);

  const totalExp = kpis.totalExpenses;
  const totalInc = kpis.totalIncome;
  const net = kpis.netCashflow;
  const monthlyBurn = totalExp / months;
  const monthlyIncome = totalInc / months;

  // ── 1. Cash Burn Rate ──
  const monthlyNet = monthlyIncome - monthlyBurn;
  const runwayMonths = monthlyNet >= 0 ? Infinity : (totalInc > 0 ? totalInc / monthlyBurn : 0);
  tests.push({
    id: "cash-burn-rate",
    name: "Cash Burn Rate",
    category: "liquidity",
    score: score(monthlyNet >= 0, runwayMonths >= 3),
    value: monthlyBurn,
    formattedValue: `${fmtInr(monthlyBurn)}/month`,
    benchmark: "Net positive = Pass; <3 months runway = Fail",
    interpretation: monthlyNet >= 0
      ? `Net cash flow is positive at ${fmtInr(monthlyNet)}/month — healthy burn rate.`
      : `Burning ${fmtInr(Math.abs(monthlyNet))}/month net. Estimated runway: ${runwayMonths === Infinity ? "∞" : runwayMonths.toFixed(1)} months.`,
  });

  // ── 2. Operating Cash Ratio ──
  const opCashRatio = totalExp > 0 ? net / totalExp : 0;
  tests.push({
    id: "operating-cash-ratio",
    name: "Operating Cash Ratio",
    category: "liquidity",
    score: score(opCashRatio > 0.1, opCashRatio >= 0),
    value: opCashRatio,
    formattedValue: opCashRatio.toFixed(2),
    benchmark: ">0.10 = Pass; 0–0.10 = Warn; <0 = Fail",
    interpretation: opCashRatio > 0.1
      ? `Operating cash ratio of ${opCashRatio.toFixed(2)} indicates healthy cash coverage of expenses.`
      : opCashRatio >= 0
        ? `Ratio of ${opCashRatio.toFixed(2)} is marginally positive — monitor closely.`
        : `Negative ratio of ${opCashRatio.toFixed(2)} — expenses significantly exceed income.`,
  });

  // ── 3. EBITDA Margin ──
  const ebitda = mis?.pnl?.ebitda ?? net;
  const revenue = mis?.pnl?.totalRevenue ?? totalInc;
  const ebitdaMargin = revenue > 0 ? ebitda / revenue : (totalInc === 0 && totalExp === 0 ? 0 : -1);
  tests.push({
    id: "ebitda-margin",
    name: "EBITDA Margin",
    category: "profitability",
    score: score(ebitdaMargin > 0.15, ebitdaMargin >= 0.05),
    value: ebitdaMargin,
    formattedValue: pct(ebitdaMargin),
    benchmark: ">15% = Pass; 5–15% = Warn; <5% = Fail",
    interpretation: revenue <= 0
      ? "No revenue recorded — EBITDA margin cannot be computed meaningfully."
      : ebitdaMargin > 0.15
        ? `Strong EBITDA margin of ${pct(ebitdaMargin)} — above industry benchmark.`
        : `EBITDA margin of ${pct(ebitdaMargin)} is ${ebitdaMargin < 0.05 ? "below healthy threshold" : "in the caution zone"}.`,
  });

  // ── 4. Gross Margin ──
  const grossProfit = mis?.pnl?.grossProfit ?? (totalInc - totalExp * 0.6);
  const grossMargin = revenue > 0 ? grossProfit / revenue : 0;
  tests.push({
    id: "gross-margin",
    name: "Gross Margin",
    category: "profitability",
    score: score(grossMargin > 0.40, grossMargin >= 0.20),
    value: grossMargin,
    formattedValue: pct(grossMargin),
    benchmark: ">40% = Pass; 20–40% = Warn; <20% = Fail",
    interpretation: revenue <= 0
      ? "No revenue data available to compute gross margin."
      : `Gross margin of ${pct(grossMargin)}. ${grossMargin > 0.4 ? "Healthy direct-cost efficiency." : grossMargin >= 0.2 ? "Direct costs are moderately high." : "Direct costs are consuming most revenue."}`,
  });

  // ── 5. Operating Expense Ratio ──
  const opexRatio = revenue > 0 ? totalExp / revenue : (totalExp > 0 ? Infinity : 0);
  tests.push({
    id: "opex-ratio",
    name: "Operating Expense Ratio",
    category: "efficiency",
    score: score(opexRatio < 0.70, opexRatio <= 0.85),
    value: opexRatio,
    formattedValue: revenue > 0 ? pct(opexRatio) : "N/A (no revenue)",
    benchmark: "<70% = Pass; 70–85% = Warn; >85% = Fail",
    interpretation: revenue <= 0
      ? `Total expenses of ${fmtInr(totalExp)} with no revenue — ratio is not applicable.`
      : opexRatio < 0.7
        ? `OpEx ratio of ${pct(opexRatio)} — expenses are well within revenue bounds.`
        : `OpEx ratio of ${pct(opexRatio)} — ${opexRatio > 0.85 ? "expenses are dangerously high relative to revenue" : "watch for further increases"}.`,
  });

  // ── 6. Expense Growth vs Revenue Growth ──
  const expGrowth = comparison.expenseTrendPct / 100;
  const incGrowth = comparison.incomeTrendPct / 100;
  const growthDiff = incGrowth - expGrowth;
  tests.push({
    id: "growth-balance",
    name: "Expense vs Revenue Growth",
    category: "efficiency",
    score: score(growthDiff >= 0, growthDiff >= -0.1),
    value: growthDiff,
    formattedValue: `Revenue ${incGrowth >= 0 ? "+" : ""}${pct(incGrowth)} vs Expense ${expGrowth >= 0 ? "+" : ""}${pct(expGrowth)}`,
    benchmark: "Revenue growing faster = Pass; gap >10pp = Fail",
    interpretation: growthDiff >= 0
      ? "Revenue growth is outpacing expense growth — sustainable trajectory."
      : `Expenses are growing ${pct(Math.abs(growthDiff))} faster than revenue — investigate cost drivers.`,
  });

  // ── 7. Vendor HHI ──
  const hhi = cfoExtended.expenseCategoryHhi;
  tests.push({
    id: "vendor-hhi",
    name: "Vendor Concentration (HHI)",
    category: "concentration",
    score: score(hhi < 0.15, hhi <= 0.25),
    value: hhi,
    formattedValue: hhi.toFixed(3),
    benchmark: "<0.15 = Pass (diversified); 0.15–0.25 = Warn; >0.25 = Fail (concentrated)",
    interpretation: hhi < 0.15
      ? "Expense categories are well-diversified — low concentration risk."
      : hhi <= 0.25
        ? "Moderate concentration — a few categories dominate spend."
        : "High concentration risk — spend is heavily concentrated in few categories.",
  });

  // ── 8. Top 3 Category Concentration ──
  const top3Cat = cfoExtended.top3CategorySharePct / 100;
  tests.push({
    id: "top3-category",
    name: "Top 3 Category Concentration",
    category: "concentration",
    score: score(top3Cat < 0.60, top3Cat <= 0.80),
    value: top3Cat,
    formattedValue: pct(top3Cat),
    benchmark: "<60% = Pass; 60–80% = Warn; >80% = Fail",
    interpretation: top3Cat < 0.6
      ? `Top 3 expense categories account for ${pct(top3Cat)} of spend — healthy diversification.`
      : `Top 3 categories account for ${pct(top3Cat)} — ${top3Cat > 0.8 ? "critically concentrated, review budget allocation" : "moderately concentrated"}.`,
  });

  // ── 9. Geographic (Cost Center) Concentration ──
  const top3CC = cfoExtended.top3CostCenterSharePct / 100;
  tests.push({
    id: "geo-concentration",
    name: "Geographic Concentration",
    category: "concentration",
    score: score(top3CC < 0.50, top3CC <= 0.70),
    value: top3CC,
    formattedValue: pct(top3CC),
    benchmark: "<50% = Pass; 50–70% = Warn; >70% = Fail",
    interpretation: top3CC < 0.5
      ? "Spend is distributed across cost centers — low geographic concentration."
      : `Top cost centers account for ${pct(top3CC)} of spend — ${top3CC > 0.7 ? "high concentration, consider diversification" : "moderate concentration"}.`,
  });

  // ── 10. Approval Aging ──
  const aging = cfoExtended.pendingApprovalAging;
  const medianDays = aging.medianDays ?? 0;
  tests.push({
    id: "approval-aging",
    name: "Approval Aging",
    category: "governance",
    score: score(medianDays < 3, medianDays <= 7),
    value: medianDays,
    formattedValue: `${medianDays.toFixed(1)} days (median)`,
    benchmark: "<3 days = Pass; 3–7 days = Warn; >7 days = Fail",
    interpretation: medianDays < 3
      ? "Approval workflows are running efficiently with quick turnaround."
      : `Median approval time of ${medianDays.toFixed(1)} days — ${medianDays > 7 ? "significant bottleneck, review approval chains" : "minor delays, monitor trends"}.`,
  });

  // ── 11. Approval Backlog ──
  const over7 = aging.countOver7Days;
  tests.push({
    id: "approval-backlog",
    name: "Approval Backlog",
    category: "governance",
    score: score(over7 < 10, over7 <= 25),
    value: over7,
    formattedValue: `${over7} pending >7 days`,
    benchmark: "<10 = Pass; 10–25 = Warn; >25 = Fail",
    interpretation: over7 < 10
      ? "Approval backlog is minimal — governance controls are effective."
      : `${over7} approvals pending over 7 days — ${over7 > 25 ? "critical backlog, risk of financial delays and compliance issues" : "growing backlog, prioritize older requests"}.`,
  });

  // ── 12. MoM Expense Trend ──
  const momChange = Math.abs(comparison.expenseTrendPct) / 100;
  const expDir = comparison.expenseTrendPct >= 0 ? "increase" : "decrease";
  tests.push({
    id: "mom-expense-trend",
    name: "MoM Expense Trend",
    category: "trend",
    score: score(momChange < 0.05, momChange <= 0.15),
    value: comparison.expenseTrendPct / 100,
    formattedValue: `${comparison.expenseTrendPct >= 0 ? "+" : ""}${pct(comparison.expenseTrendPct / 100)}`,
    benchmark: "<5% change = Pass; 5–15% = Warn; >15% = Fail",
    interpretation: momChange < 0.05
      ? "Expenses are stable compared to the prior period — predictable spend."
      : `Expenses show a ${pct(momChange)} ${expDir} vs prior period — ${momChange > 0.15 ? "significant variance, investigate root cause" : "moderate shift, monitor next period"}.`,
  });

  // ── 13. Budget Variance (estimated from trend when no budget data) ──
  const expectedExp = comparison.prevTotalExpenses;
  const variance = expectedExp > 0 ? (totalExp - expectedExp) / expectedExp : 0;
  const absVariance = Math.abs(variance);
  tests.push({
    id: "budget-variance",
    name: "Budget Variance",
    category: "trend",
    score: score(absVariance < 0.05, absVariance <= 0.10),
    value: variance,
    formattedValue: `${variance >= 0 ? "+" : ""}${pct(variance)} vs prior period`,
    benchmark: "<5% = Pass; 5–10% = Warn; >10% = Fail",
    interpretation: expectedExp <= 0
      ? "No prior period data available for variance comparison."
      : absVariance < 0.05
        ? "Spending is well-aligned with historical patterns."
        : `${pct(absVariance)} ${variance > 0 ? "over" : "under"}-spend vs prior period — ${absVariance > 0.1 ? "requires investigation" : "minor deviation"}.`,
  });

  // ── 14. Runway Analysis ──
  const netOperating = mis?.cashflow?.netOperating ?? net;
  const monthlyNetOp = netOperating / months;
  const cashRunway = monthlyNetOp >= 0 ? Infinity : Math.abs(totalInc / (monthlyNetOp || 1));
  tests.push({
    id: "runway-analysis",
    name: "Cash Runway",
    category: "cashflow",
    score: score(cashRunway > 6 || monthlyNetOp >= 0, cashRunway >= 3),
    value: cashRunway === Infinity ? null : cashRunway,
    formattedValue: monthlyNetOp >= 0 ? "Positive cash flow" : `~${cashRunway.toFixed(1)} months`,
    benchmark: ">6 months = Pass; 3–6 months = Warn; <3 months = Fail",
    interpretation: monthlyNetOp >= 0
      ? "Cash flow is positive — no runway concern."
      : cashRunway >= 6
        ? `Approximately ${cashRunway.toFixed(1)} months of runway at current burn — adequate buffer.`
        : `Only ${cashRunway.toFixed(1)} months of runway — ${cashRunway < 3 ? "critical, immediate action needed" : "build cash reserves"}.`,
  });

  // ── 15. Outlier Detection (top vendor concentration as anomaly proxy) ──
  const topVendors = cfoExtended.topVendors;
  const outlierVendors = topVendors.filter((v) => v.sharePct > 30);
  tests.push({
    id: "outlier-detection",
    name: "Outlier Detection",
    category: "anomaly",
    score: score(outlierVendors.length === 0, outlierVendors.length <= 1),
    value: outlierVendors.length,
    formattedValue: `${outlierVendors.length} vendor(s) >30% share`,
    benchmark: "0 outliers = Pass; 1 = Warn; >1 = Fail",
    interpretation: outlierVendors.length === 0
      ? "No single vendor dominates spend — healthy vendor distribution."
      : `${outlierVendors.map((v) => `${v.name} (${v.sharePct.toFixed(1)}%)`).join(", ")} — ${outlierVendors.length > 1 ? "multiple vendors with outsized share, high dependency risk" : "single dominant vendor, consider alternatives"}.`,
  });

  // ── Compute overall score ──
  const scoreMap: Record<HealthTestScore, number> = { pass: 100, warn: 50, fail: 0 };
  const total = tests.reduce((sum, t) => sum + scoreMap[t.score], 0);
  const overallScore = Math.round(total / tests.length);
  const grade = overallScore >= 85 ? "A" as const
    : overallScore >= 70 ? "B" as const
    : overallScore >= 55 ? "C" as const
    : overallScore >= 40 ? "D" as const
    : "F" as const;

  return {
    overallScore,
    grade,
    tests,
    generatedAt: new Date().toISOString(),
  };
}
