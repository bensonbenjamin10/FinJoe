/**
 * Seeds a demo tenant with ACME-style data: multi-branch, GST, petty cash,
 * 1000+ income/expense/bank/invoice rows, ~8–10 Cr annual-scale revenue.
 */

import { eq } from "drizzle-orm";
import { db } from "./db.js";
import {
  costCenters,
  expenseCategories,
  incomeCategories,
  expenses,
  incomeRecords,
  finjoeSettings,
  finJoeContacts,
  pettyCashFunds,
  billingCustomers,
  invoices,
  invoiceLines,
  bankTransactions,
} from "../shared/schema.js";
import { seedMISCategoriesForTenant } from "./seed-mis-categories.js";
import { logger } from "./logger.js";

/**
 * Normalize to E.164 for storage — must stay in sync with worker/src/twilio.ts normalizePhone.
 * 10-digit bare numbers are assumed to be Indian (+91).
 */
export function normalizePhoneForContact(raw: string): string {
  let r = raw.replace(/^whatsapp:/i, "").trim();
  if (/^\+\d{7,15}$/.test(r)) return r;
  let digits = r.replace(/\D/g, "");
  while (digits.startsWith("0") && digits.length > 10) digits = digits.substring(1);
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function distributeTotal(target: number, n: number): number[] {
  const raw = Array.from({ length: n }, () => Math.random() + 0.05);
  const s = raw.reduce((a, b) => a + b, 0);
  const rounded = raw.map((x) => Math.max(100, Math.round((x / s) * target)));
  const drift = target - rounded.reduce((a, b) => a + b, 0);
  if (rounded.length > 0) rounded[rounded.length - 1] = Math.max(100, rounded[rounded.length - 1] + drift);
  return rounded;
}

function randomDateBetween(start: Date, end: Date): Date {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

const EXPENSE_STATUSES = ["draft", "submitted", "approved", "approved", "approved", "rejected"] as const;
const VENDORS = [
  "Vertex Supplies Pvt Ltd",
  "CloudNine IT Services",
  "Metro Logistics",
  "Bright Media Agency",
  "Secure Guard Services",
  "PowerGrid Utilities",
  "Fresh Foods Distributors",
];
const GSTIN_SAMPLE = "27AABCU9603R1ZM";

export type ProvisionDemoParams = {
  demoTenantId: string;
  adminUserId: string;
  contactPhone: string;
  /** Used in tenant display name only */
  orgLabel: string;
};

export async function provisionDemoTenantData(params: ProvisionDemoParams): Promise<{ counts: Record<string, number> }> {
  const { demoTenantId, adminUserId, contactPhone, orgLabel } = params;
  const phoneNorm = normalizePhoneForContact(contactPhone);

  await seedMISCategoriesForTenant(demoTenantId);

  const [ccHo] = await db
    .insert(costCenters)
    .values({
      tenantId: demoTenantId,
      name: "Head Office",
      slug: "head-office",
      type: "branch",
      isActive: true,
      billingGstin: GSTIN_SAMPLE,
    })
    .returning();
  const [ccNorth] = await db
    .insert(costCenters)
    .values({
      tenantId: demoTenantId,
      name: "North Branch",
      slug: "north-branch",
      type: "branch",
      isActive: true,
      billingGstin: GSTIN_SAMPLE,
    })
    .returning();
  const [ccSouth] = await db
    .insert(costCenters)
    .values({
      tenantId: demoTenantId,
      name: "South Branch",
      slug: "south-branch",
      type: "branch",
      isActive: true,
    })
    .returning();
  const [ccEast] = await db
    .insert(costCenters)
    .values({
      tenantId: demoTenantId,
      name: "East Operations",
      slug: "east-ops",
      type: "department",
      isActive: true,
    })
    .returning();

  const centers = [ccHo!, ccNorth!, ccSouth!, ccEast!];

  const settingsRow = {
    costCenterLabel: "Branch",
    costCenterType: "branch",
    fyStartMonth: 4,
    requireConfirmationBeforePost: false,
    askOptionalFields: false,
  } as const;
  const [existingFjSettings] = await db
    .select({ id: finjoeSettings.id })
    .from(finjoeSettings)
    .where(eq(finjoeSettings.tenantId, demoTenantId))
    .limit(1);
  if (existingFjSettings) {
    await db
      .update(finjoeSettings)
      .set({ ...settingsRow, updatedAt: new Date() })
      .where(eq(finjoeSettings.tenantId, demoTenantId));
  } else {
    await db.insert(finjoeSettings).values({
      tenantId: demoTenantId,
      ...settingsRow,
    });
  }

  const expCats = await db
    .select({ id: expenseCategories.id, slug: expenseCategories.slug })
    .from(expenseCategories)
    .where(eq(expenseCategories.tenantId, demoTenantId));
  const slugToExpId = new Map(expCats.map((c) => [c.slug, c.id]));
  const pickCategory = () => {
    const slugs = ["operating_expenses", "advertising_expenses", "employee_benefit_expenses", "travel_stay", "rent_expenses"];
    const s = slugs[Math.floor(Math.random() * slugs.length)];
    return slugToExpId.get(s) ?? expCats[0]?.id;
  };

  const incCats = await db
    .select({ id: incomeCategories.id, slug: incomeCategories.slug })
    .from(incomeCategories)
    .where(eq(incomeCategories.tenantId, demoTenantId));
  const pickIncomeCat = () => incCats[Math.floor(Math.random() * incCats.length)]?.id ?? incCats[0]?.id;

  // --- Petty cash (3 funds) ---
  const imprest = 500_000;
  for (const cc of centers.slice(0, 3)) {
    await db.insert(pettyCashFunds).values({
      tenantId: demoTenantId,
      costCenterId: cc.id,
      custodianId: adminUserId,
      imprestAmount: imprest,
      currentBalance: Math.round(imprest * (0.3 + Math.random() * 0.5)),
    });
  }

  // --- Contact for WhatsApp routing ---
  await db.insert(finJoeContacts).values({
    tenantId: demoTenantId,
    phone: phoneNorm,
    role: "admin",
    name: `Demo user (${orgLabel})`,
    studentId: adminUserId,
    isActive: true,
  });

  const now = new Date();
  const yearStart = new Date(now.getFullYear() - 1, 3, 1); // FY-ish from April
  const end = now;

  // Revenue target 8.5–9.5 Cr (INR integer amounts as rest of app)
  const turnoverTarget = 85_000_000 + Math.floor(Math.random() * 10_000_000);
  const incomeParts = distributeTotal(turnoverTarget, 520);

  let expenseIns = 0;
  const expenseBatch: (typeof expenses.$inferInsert)[] = [];
  for (let i = 0; i < 620; i++) {
    const cc = centers[Math.floor(Math.random() * centers.length)];
    const catId = pickCategory();
    if (!catId) continue;
    const st = EXPENSE_STATUSES[Math.floor(Math.random() * EXPENSE_STATUSES.length)];
    const amt = Math.max(500, Math.round(2000 + Math.random() * 450_000));
    const hasGst = Math.random() > 0.25;
    const submittedAt =
      st === "draft" ? null : randomDateBetween(yearStart, end);
    expenseBatch.push({
      tenantId: demoTenantId,
      costCenterId: cc.id,
      categoryId: catId,
      amount: amt,
      expenseDate: randomDateBetween(yearStart, end),
      description: `Demo Opex — ${VENDORS[i % VENDORS.length]}`,
      particulars: `Ref DEMO-EXP-${i + 1}`,
      status: st,
      source: "finjoe",
      vendorName: VENDORS[i % VENDORS.length],
      invoiceNumber: hasGst ? `INV/${now.getFullYear()}/${10000 + i}` : null,
      invoiceDate: hasGst ? randomDateBetween(yearStart, end) : null,
      gstin: hasGst ? GSTIN_SAMPLE : null,
      taxType: hasGst ? "gst_itc" : "no_gst",
      submittedById: st !== "draft" ? adminUserId : null,
      submittedAt,
      approvedById: st === "approved" || st === "rejected" ? adminUserId : null,
      approvedAt: st === "approved" || st === "rejected" ? randomDateBetween(yearStart, end) : null,
    });
    if (expenseBatch.length >= 80) {
      await db.insert(expenses).values(expenseBatch);
      expenseIns += expenseBatch.length;
      expenseBatch.length = 0;
    }
  }
  if (expenseBatch.length) {
    await db.insert(expenses).values(expenseBatch);
    expenseIns += expenseBatch.length;
  }

  let incomeIns = 0;
  const incomeBatch: (typeof incomeRecords.$inferInsert)[] = [];
  for (let i = 0; i < incomeParts.length; i++) {
    const cc = centers[Math.floor(Math.random() * centers.length)];
    const catId = pickIncomeCat();
    if (!catId) continue;
    incomeBatch.push({
      tenantId: demoTenantId,
      costCenterId: cc.id,
      categoryId: catId,
      amount: incomeParts[i]!,
      incomeDate: randomDateBetween(yearStart, end),
      particulars: `Demo revenue — batch ${i + 1}`,
      incomeType: "other",
      source: "manual",
      recordedById: adminUserId,
    });
    if (incomeBatch.length >= 80) {
      await db.insert(incomeRecords).values(incomeBatch);
      incomeIns += incomeBatch.length;
      incomeBatch.length = 0;
    }
  }
  if (incomeBatch.length) {
    await db.insert(incomeRecords).values(incomeBatch);
    incomeIns += incomeBatch.length;
  }

  // --- Billing customers & GST invoices ---
  const customers: { id: string }[] = [];
  for (let i = 0; i < 35; i++) {
    const [c] = await db
      .insert(billingCustomers)
      .values({
        tenantId: demoTenantId,
        name: `ACME Client ${i + 1}`,
        email: `client${i + 1}@demo-acme.example`,
        phone: `9198765${String(40000 + i).slice(-5)}`,
        gstin: GSTIN_SAMPLE,
        isActive: true,
      })
      .returning({ id: billingCustomers.id });
    if (c) customers.push(c);
  }

  let invCount = 0;
  let lineCount = 0;
  for (let i = 0; i < 120; i++) {
    const cust = customers[Math.floor(Math.random() * customers.length)];
    if (!cust) break;
    const cc = centers[Math.floor(Math.random() * centers.length)];
    const incCat = pickIncomeCat();
    const subtotal = Math.max(10_000, Math.round(50_000 + Math.random() * 2_500_000));
    const taxRate = 18;
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const total = subtotal + taxAmount;
    const st = ["draft", "issued", "paid", "paid", "paid"][Math.floor(Math.random() * 5)] as "draft" | "issued" | "paid";
    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId: demoTenantId,
        customerId: cust.id,
        invoiceNumber: `ACME/${now.getFullYear()}/${8000 + i}`,
        status: st,
        issueDate: randomDateBetween(yearStart, end),
        dueDate: randomDateBetween(yearStart, end),
        subtotal,
        taxAmount,
        total,
        amountPaid: st === "paid" ? total : st === "issued" ? Math.round(total * 0.3) : 0,
        currency: "INR",
        costCenterId: cc.id,
        incomeCategoryId: incCat ?? null,
        issuedById: adminUserId,
        issuedAt: new Date(),
      })
      .returning({ id: invoices.id });
    if (!inv) continue;
    invCount++;
    await db.insert(invoiceLines).values({
      invoiceId: inv.id,
      description: "Professional services (demo)",
      quantity: 1,
      unitAmount: subtotal,
      taxRate,
      lineTotal: total,
      incomeCategoryId: incCat ?? null,
      displayOrder: 0,
    });
    lineCount++;
  }

  // --- Bank statement lines (mix of credits/debits) ---
  let bankIns = 0;
  const bankBatch: (typeof bankTransactions.$inferInsert)[] = [];
  for (let i = 0; i < 320; i++) {
    const isCredit = Math.random() > 0.42;
    const amt = Math.max(1_000, Math.round(5_000 + Math.random() * 800_000));
    bankBatch.push({
      tenantId: demoTenantId,
      transactionDate: randomDateBetween(yearStart, end),
      particulars: isCredit ? `NEFT In — Client ${(i % 30) + 1}` : `NEFT Out — ${VENDORS[i % VENDORS.length]}`,
      amount: amt,
      type: isCredit ? "credit" : "debit",
      reconciliationStatus: Math.random() > 0.65 ? "unmatched" : "unmatched",
    });
    if (bankBatch.length >= 80) {
      await db.insert(bankTransactions).values(bankBatch);
      bankIns += bankBatch.length;
      bankBatch.length = 0;
    }
  }
  if (bankBatch.length) {
    await db.insert(bankTransactions).values(bankBatch);
    bankIns += bankBatch.length;
  }

  const totalRows = expenseIns + incomeIns + invCount + bankIns + lineCount;
  logger.info("Demo tenant provisioned", {
    demoTenantId,
    expenseIns,
    incomeIns,
    invoices: invCount,
    invoiceLines: lineCount,
    bankIns,
    turnoverTarget,
    totalRows,
  });

  return {
    counts: {
      expenses: expenseIns,
      incomeRecords: incomeIns,
      invoices: invCount,
      bankTransactions: bankIns,
      invoiceLines: lineCount,
      totalDataRows: totalRows,
    },
  };
}
