/**
 * Proactive weekly insights - sends expense/income summary to admin/finance contacts.
 * Call via GET /cron/weekly-insights?secret=CRON_SECRET
 */

import { eq, and, sql, or } from "drizzle-orm";
import { db } from "./db.js";
import { expenses, incomeRecords, finJoeContacts, tenants } from "../../shared/schema.js";
import { sendWith24hRouting } from "./send.js";
import { logger } from "./logger.js";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runWeeklyInsights(): Promise<{ tenantsProcessed: number; messagesSent: number }> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevStartDate.getDate() - 6);

  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);
  const prevStartStr = toDateStr(prevStartDate);
  const prevEndStr = toDateStr(prevEndDate);

  const activeTenants = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let messagesSent = 0;

  for (const tenant of activeTenants) {
    try {
      const [currExpenses, currIncome, prevExpenses, prevIncome] = await Promise.all([
        db
          .select({ amount: expenses.amount })
          .from(expenses)
          .where(
            and(
              eq(expenses.tenantId, tenant.id),
              sql`${expenses.expenseDate} >= ${startStr}::date`,
              sql`${expenses.expenseDate} <= ${endStr}::date`
            )
          ),
        db
          .select({ amount: incomeRecords.amount })
          .from(incomeRecords)
          .where(
            and(
              eq(incomeRecords.tenantId, tenant.id),
              sql`${incomeRecords.incomeDate} >= ${startStr}::date`,
              sql`${incomeRecords.incomeDate} <= ${endStr}::date`
            )
          ),
        db
          .select({ amount: expenses.amount })
          .from(expenses)
          .where(
            and(
              eq(expenses.tenantId, tenant.id),
              sql`${expenses.expenseDate} >= ${prevStartStr}::date`,
              sql`${expenses.expenseDate} <= ${prevEndStr}::date`
            )
          ),
        db
          .select({ amount: incomeRecords.amount })
          .from(incomeRecords)
          .where(
            and(
              eq(incomeRecords.tenantId, tenant.id),
              sql`${incomeRecords.incomeDate} >= ${prevStartStr}::date`,
              sql`${incomeRecords.incomeDate} <= ${prevEndStr}::date`
            )
          ),
      ]);

      const totalExpenses = currExpenses.reduce((s, r) => s + (r.amount ?? 0), 0);
      const totalIncome = currIncome.reduce((s, r) => s + (r.amount ?? 0), 0);
      const prevTotalExpenses = prevExpenses.reduce((s, r) => s + (r.amount ?? 0), 0);
      const prevTotalIncome = prevIncome.reduce((s, r) => s + (r.amount ?? 0), 0);

      const expenseTrend = prevTotalExpenses > 0 ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : 0;
      const incomeTrend = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;

      const msg = [
        `*FinJoe Weekly Summary* (${tenant.name})`,
        ``,
        `This week:`,
        `• Expenses: ₹${totalExpenses.toLocaleString("en-IN")}${expenseTrend !== 0 ? ` (${expenseTrend >= 0 ? "+" : ""}${expenseTrend.toFixed(0)}% vs last week)` : ""}`,
        `• Income: ₹${totalIncome.toLocaleString("en-IN")}${incomeTrend !== 0 ? ` (${incomeTrend >= 0 ? "+" : ""}${incomeTrend.toFixed(0)}% vs last week)` : ""}`,
        `• Net: ₹${(totalIncome - totalExpenses).toLocaleString("en-IN")}`,
      ].join("\n");

      const contacts = await db
        .select({ phone: finJoeContacts.phone })
        .from(finJoeContacts)
        .where(
          and(
            eq(finJoeContacts.tenantId, tenant.id),
            eq(finJoeContacts.isActive, true),
            or(eq(finJoeContacts.role, "admin"), eq(finJoeContacts.role, "finance"))
          )
        );

      const seenPhones = new Set<string>();
      for (const c of contacts) {
        const phone = c.phone?.trim();
        if (!phone || seenPhones.has(phone)) continue;
        seenPhones.add(phone);
        try {
          const ok = await sendWith24hRouting(phone, msg, null, `weekly-${tenant.id}`, tenant.id);
          if (ok) messagesSent++;
        } catch (err) {
          logger.warn("Weekly insights send failed", { tenantId: tenant.id, phone, err: String(err) });
        }
      }
    } catch (err) {
      logger.error("Weekly insights tenant error", { tenantId: tenant.id, err: String(err) });
    }
  }

  return { tenantsProcessed: activeTenants.length, messagesSent };
}
