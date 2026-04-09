/**
 * Accounting exports (Tally XML, Zoho CSV) and Zoho Books OAuth + sync.
 */

import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "./db.js";
import { requireAdmin, getTenantId } from "./auth.js";
import { logger } from "./logger.js";
import {
  tenantIntegrations,
  integrationMappings,
  expenses,
  expenseCategories,
  incomeRecords,
  incomeCategories,
  costCenters,
  vendors,
} from "../shared/schema.js";
import { buildAccountingExport, type AccountingExportExpenseRow, type AccountingExportIncomeRow } from "../lib/accounting-export/engine.js";
import {
  buildExpensePaymentVoucherXml,
  buildIncomeReceiptVoucherXml,
  buildTallyImportEnvelope,
} from "../lib/tally-xml.js";
import { buildZohoBillsCsv, buildZohoIncomeCsv } from "../lib/zoho-books-csv.js";
import {
  buildZohoAuthorizeUrl,
  exchangeZohoAuthorizationCode,
  refreshZohoAccessToken,
  listZohoOrganizations,
  zohoBooksGet,
  zohoBooksPost,
} from "../lib/zoho-books-api.js";
import { isProductionApi, jsonInternalError } from "./client-safe-error.js";

const ZOHO = "zoho_books";

function zohoOAuthQueryErrorMessage(err: string): string {
  return isProductionApi ? "Zoho authorization failed." : `Zoho error: ${err}`;
}

function zohoTokenExchangeFailedPage(detail: string): string {
  return isProductionApi ? "Zoho connection failed. Please try again." : `Zoho token exchange failed: ${detail}`;
}

function resolveTenantId(req: Request): string | null {
  return getTenantId(req) ?? (typeof req.query.tenantId === "string" ? req.query.tenantId : null);
}

async function getZohoRow(tenantId: string) {
  const [row] = await db
    .select()
    .from(tenantIntegrations)
    .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, ZOHO)))
    .limit(1);
  return row ?? null;
}

async function ensureZohoAccessToken(tenantId: string): Promise<{ accessToken: string; organizationId: string } | null> {
  const row = await getZohoRow(tenantId);
  if (!row?.accessToken || !row.organizationId) return null;
  const exp = row.tokenExpiresAt;
  const needsRefresh = !exp || (exp instanceof Date && exp.getTime() < Date.now() + 60_000);
  if (needsRefresh) {
    if (!row.refreshToken) return null;
    try {
      const t = await refreshZohoAccessToken(row.refreshToken);
      const expiresAt = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
      await db
        .update(tenantIntegrations)
        .set({
          accessToken: t.access_token,
          refreshToken: t.refresh_token ?? row.refreshToken,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrations.id, row.id));
      return { accessToken: t.access_token, organizationId: row.organizationId };
    } catch (e) {
      logger.error("Zoho token refresh failed", { err: String(e), tenantId });
      return null;
    }
  }
  return { accessToken: row.accessToken, organizationId: row.organizationId };
}

export function registerIntegrationsRoutes(app: Express) {
  /** Tally Prime–style XML import file */
  app.get("/api/admin/accounting-export/tally", requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "tenantId required" });
      const from = String(req.query.from ?? "");
      const to = String(req.query.to ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
      }
      const bankLedger = typeof req.query.bankLedger === "string" ? req.query.bankLedger : undefined;
      const rows = await buildAccountingExport(db, { tenantId, fromDate: from, toDate: to });
      const parts: string[] = [];
      for (const r of rows) {
        if (r.kind === "expense") parts.push(buildExpensePaymentVoucherXml(r as AccountingExportExpenseRow, { bankLedgerName: bankLedger }));
        else parts.push(buildIncomeReceiptVoucherXml(r as AccountingExportIncomeRow, { bankLedgerName: bankLedger }));
      }
      const xml = buildTallyImportEnvelope(parts.join("\n"));
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="finjoe-tally-${from}-${to}.xml"`);
      res.send(xml);
    } catch (e) {
      logger.error("Tally export error", { err: String(e) });
      res.status(500).json({ error: "Export failed" });
    }
  });

  /** Zoho-friendly CSV (bills or income) */
  app.get("/api/admin/accounting-export/zoho-csv", requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "tenantId required" });
      const from = String(req.query.from ?? "");
      const to = String(req.query.to ?? "");
      const kind = String(req.query.kind ?? "bills");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
      }
      const rows = await buildAccountingExport(db, { tenantId, fromDate: from, toDate: to });
      const csv = kind === "income" ? buildZohoIncomeCsv(rows) : buildZohoBillsCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="finjoe-zoho-${kind}-${from}-${to}.csv"`,
      );
      res.send(csv);
    } catch (e) {
      logger.error("Zoho CSV export error", { err: String(e) });
      res.status(500).json({ error: "Export failed" });
    }
  });

  /** Start Zoho OAuth (redirect) */
  app.get("/api/admin/integrations/zoho/oauth/start", requireAdmin, async (req: Request, res: Response) => {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const redirectUri = process.env.ZOHO_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return res.status(503).json({ error: "Zoho OAuth is not configured (ZOHO_CLIENT_ID, ZOHO_REDIRECT_URI)" });
    }
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId required (use ?tenantId= for super admin)" });
    const user = req.user as Express.User;
    const state = Buffer.from(
      JSON.stringify({ tenantId, uid: user.id, ts: Date.now() }),
      "utf8",
    ).toString("base64url");
    const url = buildZohoAuthorizeUrl({ clientId, redirectUri, state });
    res.redirect(302, url);
  });

  /** Zoho OAuth callback */
  app.get("/api/integrations/zoho/oauth/callback", requireAdmin, async (req: Request, res: Response) => {
    const redirectUri = process.env.ZOHO_REDIRECT_URI;
    if (!redirectUri) {
      return res.status(503).send("Zoho redirect URI not configured");
    }
    const err = req.query.error as string | undefined;
    if (err) {
      return res.status(400).send(zohoOAuthQueryErrorMessage(err));
    }
    const code = req.query.code as string | undefined;
    const stateRaw = req.query.state as string | undefined;
    if (!code || !stateRaw) {
      return res.status(400).send("Missing code or state");
    }
    let state: { tenantId: string; uid: string; ts: number };
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    } catch {
      return res.status(400).send("Invalid state");
    }
    const user = req.user as Express.User;
    if (user.id !== state.uid) {
      return res.status(403).send("State does not match session user");
    }
    const tenantId = state.tenantId;
    try {
      const tokens = await exchangeZohoAuthorizationCode(code, redirectUri);
      const orgs = await listZohoOrganizations(tokens.access_token);
      const orgId = orgs[0]?.organization_id;
      if (!orgId) {
        return res.status(502).send("No Zoho Books organization found for this account");
      }
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
      const [existing] = await db
        .select({ id: tenantIntegrations.id })
        .from(tenantIntegrations)
        .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, ZOHO)))
        .limit(1);
      if (existing) {
        await db
          .update(tenantIntegrations)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            tokenExpiresAt: expiresAt,
            organizationId: orgId,
            scope: process.env.ZOHO_SCOPE ?? "ZohoBooks.fullaccess.all",
            updatedAt: new Date(),
          })
          .where(eq(tenantIntegrations.id, existing.id));
      } else {
        await db.insert(tenantIntegrations).values({
          tenantId,
          provider: ZOHO,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt: expiresAt,
          organizationId: orgId,
          scope: process.env.ZOHO_SCOPE ?? "ZohoBooks.fullaccess.all",
        });
      }
      const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
      const path = `/admin/finjoe/integrations/exports?tenantId=${encodeURIComponent(tenantId)}&zoho=connected`;
      res.redirect(302, base ? `${base}${path}` : path);
    } catch (e) {
      logger.error("Zoho OAuth callback error", { err: String(e) });
      res.status(500).send(zohoTokenExchangeFailedPage(String(e)));
    }
  });

  app.get("/api/admin/integrations/zoho/status", requireAdmin, async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    const row = await getZohoRow(tenantId);
    res.json({
      connected: !!(row?.accessToken && row?.organizationId),
      organizationId: row?.organizationId ?? null,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
    });
  });

  app.post("/api/admin/integrations/zoho/disconnect", requireAdmin, async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req) ?? (req.body?.tenantId as string | undefined);
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    await db.delete(tenantIntegrations).where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, ZOHO)));
    res.json({ ok: true });
  });

  /** Pull chart of accounts + contacts into response (and optional cache in metadata). */
  app.post("/api/admin/integrations/zoho/sync/import", requireAdmin, async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req) ?? (req.body?.tenantId as string | undefined);
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    const tok = await ensureZohoAccessToken(tenantId);
    if (!tok) return res.status(400).json({ error: "Zoho not connected or token invalid" });
    try {
      const coa = await zohoBooksGet<{ chartofaccounts?: unknown[] }>(
        "/chartofaccounts",
        tok.accessToken,
        tok.organizationId,
      );
      const contacts = await zohoBooksGet<{ contacts?: unknown[] }>("/contacts", tok.accessToken, tok.organizationId, {
        page: "1",
        per_page: "200",
      });
      const row = await getZohoRow(tenantId);
      if (row) {
        await db
          .update(tenantIntegrations)
          .set({
            metadata: {
              ...((row.metadata as Record<string, unknown>) ?? {}),
              lastImportAt: new Date().toISOString(),
              chartofaccountsCount: Array.isArray((coa as { chartofaccounts?: unknown[] }).chartofaccounts)
                ? (coa as { chartofaccounts: unknown[] }).chartofaccounts.length
                : 0,
              contactsCount: Array.isArray((contacts as { contacts?: unknown[] }).contacts)
                ? (contacts as { contacts: unknown[] }).contacts.length
                : 0,
            },
            updatedAt: new Date(),
          })
          .where(eq(tenantIntegrations.id, row.id));
      }
      res.json({
        chartofaccounts: (coa as { chartofaccounts?: unknown[] }).chartofaccounts ?? [],
        contacts: (contacts as { contacts?: unknown[] }).contacts ?? [],
      });
    } catch (e) {
      logger.error("Zoho import error", { err: String(e), tenantId });
      res.status(500).json(jsonInternalError());
    }
  });

  /** Push one expense as a bill (creates vendor contact in Zoho if needed). */
  app.post("/api/admin/integrations/zoho/sync/push-expense/:expenseId", requireAdmin, async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req) ?? (req.body?.tenantId as string | undefined);
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    const tok = await ensureZohoAccessToken(tenantId);
    if (!tok) return res.status(400).json({ error: "Zoho not connected or token invalid" });
    const expenseId = req.params.expenseId;
    try {
      const [mapping] = await db
        .select()
        .from(integrationMappings)
        .where(
          and(
            eq(integrationMappings.tenantId, tenantId),
            eq(integrationMappings.integrationType, ZOHO),
            eq(integrationMappings.entityType, "expense"),
            eq(integrationMappings.finjoeId, expenseId),
          ),
        )
        .limit(1);
      if (mapping) {
        return res.json({ ok: true, alreadySynced: true, externalId: mapping.externalId });
      }

      const [exp] = await db
        .select({
          expense: expenses,
          vendorName: vendors.name,
          categoryName: expenseCategories.name,
        })
        .from(expenses)
        .leftJoin(vendors, eq(expenses.vendorId, vendors.id))
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
        .limit(1);
      if (!exp?.expense) return res.status(404).json({ error: "Expense not found" });

      const e = exp.expense;
      const vendorDisplay = (exp.vendorName as string | null) ?? (e.vendorName as string | null) ?? "Vendor";
      let zohoVendorId: string | null = null;
      const vendorFinjoeId = e.vendorId as string | null;
      if (vendorFinjoeId) {
        const [vm] = await db
          .select()
          .from(integrationMappings)
          .where(
            and(
              eq(integrationMappings.tenantId, tenantId),
              eq(integrationMappings.integrationType, ZOHO),
              eq(integrationMappings.entityType, "vendor"),
              eq(integrationMappings.finjoeId, vendorFinjoeId),
            ),
          )
          .limit(1);
        if (vm) zohoVendorId = vm.externalId;
      }
      if (!zohoVendorId) {
        const createContact = await zohoBooksPost<{ contact?: { contact_id?: string } }>(
          "/contacts",
          tok.accessToken,
          tok.organizationId,
          {
            contact_name: vendorDisplay,
            contact_type: "vendor",
            gst_no: e.gstin ?? undefined,
          },
        );
        zohoVendorId = createContact.contact?.contact_id ?? null;
        if (zohoVendorId && vendorFinjoeId) {
          await db.insert(integrationMappings).values({
            tenantId,
            integrationType: ZOHO,
            entityType: "vendor",
            finjoeId: vendorFinjoeId,
            externalId: zohoVendorId,
            lastSyncAt: new Date(),
          });
        }
      }
      if (!zohoVendorId) {
        return res.status(502).json({ error: "Could not resolve Zoho vendor" });
      }

      const rupees = Math.abs(Number(e.amount)) / 100;
      const billDate = e.expenseDate instanceof Date ? e.expenseDate.toISOString().slice(0, 10) : String(e.expenseDate ?? "").slice(0, 10);
      const bill = await zohoBooksPost<{ bill?: { bill_id?: string } }>("/bills", tok.accessToken, tok.organizationId, {
        vendor_id: zohoVendorId,
        bill_number: `FJ-${expenseId.slice(0, 8)}`,
        date: billDate || new Date().toISOString().slice(0, 10),
        line_items: [
          {
            description: (e.description as string | null) ?? (e.particulars as string | null) ?? "Expense",
            rate: rupees,
            quantity: 1,
          },
        ],
      });
      const billId = bill.bill?.bill_id;
      if (billId) {
        await db.insert(integrationMappings).values({
          tenantId,
          integrationType: ZOHO,
          entityType: "expense",
          finjoeId: expenseId,
          externalId: billId,
          lastSyncAt: new Date(),
        });
      }
      res.json({ ok: true, billId });
    } catch (e) {
      logger.error("Zoho push expense error", { err: String(e), expenseId, tenantId });
      res.status(500).json(jsonInternalError());
    }
  });

  /** Push income record as a deposit-style journal is complex; create customer payment against dummy sales — MVP: customer payment not modeled. Use income as "deposit" via journal or skip. Plan: POST customerpayment or record expense inverse — use simple "deposit" by creating a sales receipt without invoice — Zoho needs invoice. Fallback: queue integration event. */
  app.post("/api/admin/integrations/zoho/sync/push-income/:incomeId", requireAdmin, async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req) ?? (req.body?.tenantId as string | undefined);
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    const tok = await ensureZohoAccessToken(tenantId);
    if (!tok) return res.status(400).json({ error: "Zoho not connected or token invalid" });
    const incomeId = req.params.incomeId;
    try {
      const [mapping] = await db
        .select()
        .from(integrationMappings)
        .where(
          and(
            eq(integrationMappings.tenantId, tenantId),
            eq(integrationMappings.integrationType, ZOHO),
            eq(integrationMappings.entityType, "income_record"),
            eq(integrationMappings.finjoeId, incomeId),
          ),
        )
        .limit(1);
      if (mapping) {
        return res.json({ ok: true, alreadySynced: true, externalId: mapping.externalId });
      }

      const [inc] = await db
        .select({
          income: incomeRecords,
          categoryName: incomeCategories.name,
          costCenterName: costCenters.name,
        })
        .from(incomeRecords)
        .leftJoin(incomeCategories, eq(incomeRecords.categoryId, incomeCategories.id))
        .leftJoin(costCenters, eq(incomeRecords.costCenterId, costCenters.id))
        .where(and(eq(incomeRecords.id, incomeId), eq(incomeRecords.tenantId, tenantId)))
        .limit(1);
      if (!inc?.income) return res.status(404).json({ error: "Income record not found" });

      const i = inc.income;
      const rupees = Math.abs(Number(i.amount)) / 100;
      const depositDate =
        i.incomeDate instanceof Date ? i.incomeDate.toISOString().slice(0, 10) : String(i.incomeDate ?? "").slice(0, 10);

      const customerName = (inc.categoryName as string | null) ?? "Income";
      const [custMap] = await db
        .select()
        .from(integrationMappings)
        .where(
          and(
            eq(integrationMappings.tenantId, tenantId),
            eq(integrationMappings.integrationType, ZOHO),
            eq(integrationMappings.entityType, "zoho_income_customer"),
            eq(integrationMappings.finjoeId, tenantId),
          ),
        )
        .limit(1);

      let customerId: string | null = custMap?.externalId ?? null;
      if (!customerId) {
        const c = await zohoBooksPost<{ contact?: { contact_id?: string } }>("/contacts", tok.accessToken, tok.organizationId, {
          contact_name: `FinJoe income — ${customerName}`,
          contact_type: "customer",
        });
        customerId = c.contact?.contact_id ?? null;
        if (customerId) {
          await db.insert(integrationMappings).values({
            tenantId,
            integrationType: ZOHO,
            entityType: "zoho_income_customer",
            finjoeId: tenantId,
            externalId: customerId,
            lastSyncAt: new Date(),
            metadata: { label: customerName },
          });
        }
      }
      if (!customerId) return res.status(502).json({ error: "Could not create Zoho customer" });

      const inv = await zohoBooksPost<{ invoice?: { invoice_id?: string } }>("/invoices", tok.accessToken, tok.organizationId, {
        customer_id: customerId,
        date: depositDate || new Date().toISOString().slice(0, 10),
        line_items: [
          {
            name: (i.particulars as string | null) ?? "Income",
            rate: rupees,
            quantity: 1,
          },
        ],
        status: "draft",
      });
      const invoiceId = inv.invoice?.invoice_id;
      if (invoiceId) {
        await db.insert(integrationMappings).values({
          tenantId,
          integrationType: ZOHO,
          entityType: "income_record",
          finjoeId: incomeId,
          externalId: invoiceId,
          lastSyncAt: new Date(),
        });
      }
      res.json({ ok: true, invoiceId });
    } catch (e) {
      logger.error("Zoho push income error", { err: String(e), incomeId, tenantId });
      res.status(500).json(jsonInternalError());
    }
  });
}
