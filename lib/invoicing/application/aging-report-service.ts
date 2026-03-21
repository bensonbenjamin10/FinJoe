import { eq, and, sql } from "drizzle-orm";
import { invoices } from "../../../shared/schema.js";

export interface AgingBucket {
  label: string;
  count: number;
  amount: number;
}

export function createAgingReportService(db: any) {
  return {
    async getAging(tenantId: string): Promise<AgingBucket[]> {
      const rows = await db
        .select({
          bucket: sql<string>`
            CASE
              WHEN ${invoices.dueDate} IS NULL OR ${invoices.dueDate} >= now() THEN 'current'
              WHEN now() - ${invoices.dueDate} <= interval '30 days' THEN '1_30'
              WHEN now() - ${invoices.dueDate} <= interval '60 days' THEN '31_60'
              WHEN now() - ${invoices.dueDate} <= interval '90 days' THEN '61_90'
              ELSE '90_plus'
            END`,
          count: sql<number>`count(*)::int`,
          amount: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)::int`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            sql`${invoices.status} IN ('issued', 'partially_paid')`,
          ),
        )
        .groupBy(sql`1`);

      const labels: Record<string, string> = {
        current: "Current",
        "1_30": "1-30 days",
        "31_60": "31-60 days",
        "61_90": "61-90 days",
        "90_plus": "90+ days",
      };
      const order = ["current", "1_30", "31_60", "61_90", "90_plus"];
      const map = new Map(rows.map((r: any) => [r.bucket, r]));

      return order.map((key) => ({
        label: labels[key],
        count: (map.get(key) as any)?.count ?? 0,
        amount: (map.get(key) as any)?.amount ?? 0,
      }));
    },
  };
}
