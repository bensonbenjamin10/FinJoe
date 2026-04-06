/**
 * Summarize MIS report lines for a calendar period [startDate, endDate] (inclusive).
 * Numbers are computed from monthly buckets that overlap the range — same basis as MIS grid cells.
 */

import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { finjoeSettings } from "../shared/schema.js";
import { fyMonths, getMISReport, type MISLineItem, type MISReport } from "./mis-report.js";

export type MisLinePeriodAmount = {
  label: string;
  slug?: string;
  amount: number;
};

export type MisPeriodSlice = {
  fyLabel: string;
  periodStart: string;
  periodEnd: string;
  pnl: {
    totalRevenue: number;
    grossProfit: number;
    ebitda: number;
    topIndirectExpenses: MisLinePeriodAmount[];
  };
  cashflow: {
    netOperating: number;
    netCashFlow: number;
  };
  drillHints: Array<{ sectionSlug: string; label: string; topItem: string; amount: number }>;
};

function parseFyStartYear(fy: string): number {
  const [startYearStr] = fy.split("-");
  const n = parseInt(startYearStr, 10);
  return n < 100 ? 2000 + n : n;
}

/** Infer FY key (e.g. 2025-26) from a date and tenant FY start month (1–12). */
export function inferFyLabelForDate(isoDate: string, fyStartMonth: number): string {
  const d = new Date(isoDate + "T12:00:00.000Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const startYear = m >= fyStartMonth ? y : y - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endShort}`;
}

function sumLineForPeriod(
  line: MISLineItem,
  startDates: string[],
  endDates: string[],
  rangeStart: string,
  rangeEnd: string
): number {
  let s = 0;
  for (let i = 0; i < 12; i++) {
    const ms = startDates[i]!;
    const me = endDates[i]!;
    if (me < rangeStart || ms > rangeEnd) continue;
    s += line.values[i] ?? 0;
  }
  return Math.round(s);
}

/**
 * Build a CFO-friendly slice of MIS for the selected period. Uses getMISReport through endDate.
 */
export async function buildMisPeriodSlice(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<MisPeriodSlice | null> {
  try {
    const [settingsRow] = await db
      .select({ fyStartMonth: finjoeSettings.fyStartMonth })
      .from(finjoeSettings)
      .where(eq(finjoeSettings.tenantId, tenantId))
      .limit(1);
    const fyStartMonth = settingsRow?.fyStartMonth ?? 4;

    const fy = inferFyLabelForDate(endDate, fyStartMonth);
    const fyStartYear = parseFyStartYear(fy);
    const { startDates, endDates } = fyMonths(fyStartYear, fyStartMonth);

    const report: MISReport = await getMISReport(tenantId, fy, endDate);

    const pnl = report.pnl;
    const totalRevenue = sumLineForPeriod(pnl.totalRevenue, startDates, endDates, startDate, endDate);
    const grossProfit = sumLineForPeriod(pnl.grossProfit, startDates, endDates, startDate, endDate);
    const ebitda = sumLineForPeriod(pnl.ebitda, startDates, endDates, startDate, endDate);

    const indirect: MisLinePeriodAmount[] = pnl.indirectExpenses
      .map((l) => ({
        label: l.label,
        slug: l.slug,
        amount: sumLineForPeriod(l, startDates, endDates, startDate, endDate),
      }))
      .filter((x) => x.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 10);

    const netOperating = sumLineForPeriod(report.cashflow.netOperating, startDates, endDates, startDate, endDate);
    const netCashFlow = sumLineForPeriod(report.cashflow.netCashFlow, startDates, endDates, startDate, endDate);

    const drillHints: MisPeriodSlice["drillHints"] = [];
    for (const sec of report.drilldowns.sections.slice(0, 5)) {
      const top = sec.items[0];
      if (top && top.fyTotal !== 0) {
        const amt = sumLineForPeriod(top, startDates, endDates, startDate, endDate);
        if (amt !== 0) {
          drillHints.push({
            sectionSlug: sec.slug,
            label: sec.label,
            topItem: top.label,
            amount: amt,
          });
        }
      }
    }

    return {
      fyLabel: report.fyLabel,
      periodStart: startDate,
      periodEnd: endDate,
      pnl: {
        totalRevenue,
        grossProfit,
        ebitda,
        topIndirectExpenses: indirect,
      },
      cashflow: {
        netOperating,
        netCashFlow,
      },
      drillHints,
    };
  } catch {
    return null;
  }
}
