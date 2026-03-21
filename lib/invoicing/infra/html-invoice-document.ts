import { eq } from "drizzle-orm";
import { invoices, invoiceLines, billingCustomers, tenants } from "../../../shared/schema.js";
import type { InvoiceDocumentPort } from "../ports/invoice-document-port.js";

type DbLike = any;

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export class HtmlInvoiceDocument implements InvoiceDocumentPort {
  constructor(private db: DbLike) {}

  async generateHtml(invoiceId: string): Promise<string> {
    const [inv] = await this.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv) return "<p>Invoice not found.</p>";

    const lines = await this.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(invoiceLines.displayOrder);
    const [cust] = await this.db.select().from(billingCustomers).where(eq(billingCustomers.id, inv.customerId)).limit(1);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, inv.tenantId)).limit(1);

    const ext = (inv.ext ?? {}) as Record<string, unknown>;
    const taxBreakdown = Array.isArray(ext.taxBreakdown) ? ext.taxBreakdown as { code: string; label: string; amount: number }[] : [];
    const supplierGstin = String(ext.supplierGstin ?? "");
    const customerGstin = cust?.gstin ?? String(ext.customerGstin ?? "");
    const tenantConfig = (tenant?.taxRegimeConfig ?? {}) as Record<string, unknown>;
    const supplierName = String(tenantConfig.legalName ?? tenant?.name ?? "");
    const supplierAddress = String(tenantConfig.supplierAddress ?? tenant?.address ?? "");

    const isGst = tenant?.taxRegime === "gst_in";
    const title = isGst ? "Tax Invoice" : "Invoice";

    const lineRows = lines.map((l: any) => {
      const lineExt = (l.ext ?? {}) as Record<string, unknown>;
      const hsn = String(lineExt.hsnCode ?? "");
      const lineTaxBreakdown = Array.isArray(lineExt.taxBreakdown) ? lineExt.taxBreakdown as { code: string; label: string; amount: number }[] : [];
      const taxDetail = lineTaxBreakdown.map((t) => `${escapeHtml(t.label)}: ${formatInr(t.amount)}`).join("<br>");
      return `<tr>
        <td>${escapeHtml(l.description)}</td>
        ${isGst ? `<td class="mono">${escapeHtml(hsn) || "—"}</td>` : ""}
        <td class="right">${l.quantity}</td>
        <td class="right">${formatInr(l.unitAmount)}</td>
        <td class="right">${l.taxRate}%</td>
        ${taxDetail ? `<td class="right small">${taxDetail}</td>` : ""}
        <td class="right bold">${formatInr(l.lineTotal)}</td>
      </tr>`;
    }).join("\n");

    const hasLineTaxCol = lines.some((l: any) => {
      const le = (l.ext ?? {}) as Record<string, unknown>;
      return Array.isArray(le.taxBreakdown) && (le.taxBreakdown as unknown[]).length > 0;
    });

    const taxSummary = taxBreakdown.length
      ? taxBreakdown.map((t) => `<div class="row"><span>${escapeHtml(t.label)}</span><span>${formatInr(t.amount)}</span></div>`).join("\n")
      : `<div class="row"><span>Tax</span><span>${formatInr(inv.taxAmount)}</span></div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} ${escapeHtml(inv.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; color: #1a1a1a; padding: 40px; max-width: 800px; margin: auto; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #111; padding-bottom: 16px; }
  .header-left h1 { margin-bottom: 2px; }
  .header-right { text-align: right; }
  .meta { font-size: 12px; color: #666; line-height: 1.6; }
  .meta .label { color: #999; }
  .mono { font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 4px; }
  .party p { font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; vertical-align: top; }
  .right { text-align: right; }
  .bold { font-weight: 600; }
  .small { font-size: 11px; color: #666; }
  .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-size: 14px; }
  .totals .row { display: flex; justify-content: space-between; width: 280px; }
  .totals .row.grand { font-size: 16px; font-weight: 700; border-top: 2px solid #111; padding-top: 8px; margin-top: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${escapeHtml(title)}</h1>
      <p class="meta"><span class="label">Invoice #</span> ${escapeHtml(inv.invoiceNumber)}</p>
    </div>
    <div class="header-right meta">
      <p><span class="label">Issue date:</span> ${formatDate(inv.issueDate)}</p>
      <p><span class="label">Due date:</span> ${formatDate(inv.dueDate)}</p>
      <p><span class="label">Status:</span> ${escapeHtml(String(inv.status).toUpperCase())}</p>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>From</h3>
      <p class="bold">${escapeHtml(supplierName)}</p>
      ${supplierAddress ? `<p>${escapeHtml(supplierAddress)}</p>` : ""}
      ${supplierGstin ? `<p class="mono">GSTIN: ${escapeHtml(supplierGstin)}</p>` : ""}
    </div>
    <div class="party">
      <h3>Bill to</h3>
      <p class="bold">${escapeHtml(cust?.name ?? "—")}</p>
      ${cust?.address ? `<p>${escapeHtml(cust.address)}</p>` : ""}
      ${cust?.email ? `<p>${escapeHtml(cust.email)}</p>` : ""}
      ${cust?.phone ? `<p>${escapeHtml(cust.phone)}</p>` : ""}
      ${customerGstin ? `<p class="mono">GSTIN: ${escapeHtml(customerGstin)}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        ${isGst ? "<th>HSN/SAC</th>" : ""}
        <th class="right">Qty</th>
        <th class="right">Rate</th>
        <th class="right">Tax %</th>
        ${hasLineTaxCol ? "<th class=\"right\">Tax split</th>" : ""}
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${formatInr(inv.subtotal)}</span></div>
    ${taxSummary}
    <div class="row grand"><span>Total</span><span>${formatInr(inv.total)}</span></div>
    <div class="row"><span style="color:#999">Amount paid</span><span>${formatInr(inv.amountPaid)}</span></div>
  </div>

  ${inv.notes ? `<div style="margin-top:24px;padding:12px;background:#f9f9f9;border-radius:4px;font-size:13px;"><strong>Notes:</strong> ${escapeHtml(inv.notes)}</div>` : ""}

  <div class="footer">
    Generated by FinJoe
  </div>
</body>
</html>`;
  }
}
