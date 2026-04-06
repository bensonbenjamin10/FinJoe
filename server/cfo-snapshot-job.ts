/**
 * Weekly CFO insight snapshots — persist facts + structured Gemini output per tenant.
 * Invoked from GET /cron/cfo-insight-snapshots?secret=CRON_SECRET
 */

import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { tenants, cfoInsightSnapshots } from "../shared/schema.js";
import { getAnalytics } from "./analytics.js";
import { buildMisPeriodSlice } from "./mis-period-slice.js";
import { buildCfoInsightPayload } from "./cfo-insight-builder.js";
import { generateCfoStructuredInsights } from "../lib/analytics-insights.js";
import { logger } from "./logger.js";

export async function runCfoInsightSnapshots(): Promise<{
  tenantsProcessed: number;
  snapshotsWritten: number;
}> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const activeTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isActive, true));

  let snapshotsWritten = 0;

  for (const t of activeTenants) {
    try {
      const data = await getAnalytics({
        tenantId: t.id,
        startDate: startStr,
        endDate: endStr,
        granularity: "day",
      });
      const misSlice = await buildMisPeriodSlice(t.id, startStr, endStr);
      const payload = buildCfoInsightPayload(startStr, endStr, data, misSlice);
      const structured = await generateCfoStructuredInsights(payload);

      await db.insert(cfoInsightSnapshots).values({
        tenantId: t.id,
        periodStart: startStr,
        periodEnd: endStr,
        factsJson: { cfoExtended: data.cfoExtended, mis: misSlice } as Record<string, unknown>,
        insightJson: structured
          ? {
              narrative: structured.narrative,
              keyPoints: structured.keyPoints,
              risks: structured.risks,
              suggestedActions: structured.suggestedActions,
            }
          : undefined,
        model: structured?.model ?? null,
      });
      snapshotsWritten++;
    } catch (err) {
      logger.error("CFO insight snapshot tenant error", { tenantId: t.id, err: String(err) });
    }
  }

  return { tenantsProcessed: activeTenants.length, snapshotsWritten };
}
