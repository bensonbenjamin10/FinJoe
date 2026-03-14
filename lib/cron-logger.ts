/**
 * Log cron runs to cron_runs table for admin visibility.
 * Used by server (admin trigger) and worker (scheduled cron).
 */

import { eq } from "drizzle-orm";
import { cronRuns } from "../shared/schema.js";

export async function logCronRun(db: any, jobName: string, fn: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const startedAt = new Date();
  let runId: string | null = null;
  try {
    const [inserted] = await db
      .insert(cronRuns)
      .values({ jobName, status: "success", startedAt })
      .returning({ id: cronRuns.id });
    runId = inserted?.id ?? null;
  } catch {
    /* cron_runs table may not exist yet */
  }

  try {
    const result = await fn();
    const finishedAt = new Date();
    if (runId) {
      try {
        await db.update(cronRuns).set({ resultJson: result, finishedAt }).where(eq(cronRuns.id, runId));
      } catch {
        /* ignore */
      }
    }
    return result;
  } catch (err) {
    const errMsg = String(err);
    if (runId) {
      try {
        await db.update(cronRuns).set({ status: "error", errorMessage: errMsg, finishedAt: new Date() }).where(eq(cronRuns.id, runId));
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}
