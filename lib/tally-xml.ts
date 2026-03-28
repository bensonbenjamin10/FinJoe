/**
 * Tally Prime / ERP XML import envelope for vouchers (Payment / Receipt).
 * Uses FinJoe IDs in REMOTEID / GUID / VOUCHERNUMBER for idempotent re-import.
 */

import type { AccountingExportExpenseRow, AccountingExportIncomeRow } from "./accounting-export/engine.js";
import { paiseToRupeesStr } from "./accounting-export/engine.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Tally date: DD-MMM-YYYY */
function tallyDate(ymd: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = new Date();
    ymd = d.toISOString().slice(0, 10);
  }
  const [y, m, day] = ymd.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(day).padStart(2, "0")}-${months[m - 1]}-${y}`;
}

/**
 * Payment voucher: debit party (expense), credit placeholder bank/cash ledger "FinJoe Export".
 * Receipt voucher: debit bank, credit income party.
 */
export function buildExpensePaymentVoucherXml(row: AccountingExportExpenseRow, options?: { bankLedgerName?: string }): string {
  const bankLedger = options?.bankLedgerName ?? "FinJoe Bank";
  const party = row.vendorName?.trim() || "Sundry Creditors";
  const vchNumber = `FJ-EXP-${row.id.replace(/-/g, "").slice(0, 12)}`;
  const guid = row.id;
  const amt = paiseToRupeesStr(Math.abs(row.amountPaise));
  const narr = escapeXml(
    [row.description, row.particulars, row.invoiceNumber ? `Inv ${row.invoiceNumber}` : null].filter(Boolean).join(" — ") ||
      "Expense from FinJoe",
  );
  const isPaid = row.status === "paid" || row.payoutAt != null;
  const vchType = isPaid ? "Payment" : "Journal";

  if (vchType === "Journal") {
    return `
      <VOUCHER VCHTYPE="Journal" ACTION="Create" REMOTEID="${escapeXml(guid)}">
        <DATE>${tallyDate(row.expenseDate)}</DATE>
        <GUID>${escapeXml(guid)}</GUID>
        <VOUCHERNUMBER>${escapeXml(vchNumber)}</VOUCHERNUMBER>
        <NARRATION>${narr}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(party)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <LEDGERFROMITEM>No</LEDGERFROMITEM>
          <AMOUNT>${amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(row.categoryName ?? "Expenses")}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <LEDGERFROMITEM>No</LEDGERFROMITEM>
          <AMOUNT>-${amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>`.trim();
  }

  return `
      <VOUCHER VCHTYPE="Payment" ACTION="Create" REMOTEID="${escapeXml(guid)}">
        <DATE>${tallyDate(row.expenseDate)}</DATE>
        <GUID>${escapeXml(guid)}</GUID>
        <VOUCHERNUMBER>${escapeXml(vchNumber)}</VOUCHERNUMBER>
        <NARRATION>${narr}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(party)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(bankLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>`.trim();
}

export function buildIncomeReceiptVoucherXml(row: AccountingExportIncomeRow, options?: { bankLedgerName?: string }): string {
  const bankLedger = options?.bankLedgerName ?? "FinJoe Bank";
  const party = row.categoryName?.trim() || "Sundry Debtors";
  const vchNumber = `FJ-INC-${row.id.replace(/-/g, "").slice(0, 12)}`;
  const guid = row.id;
  const amt = paiseToRupeesStr(Math.abs(row.amountPaise));
  const narr = escapeXml(row.particulars || `Income (${row.incomeType})`);

  return `
      <VOUCHER VCHTYPE="Receipt" ACTION="Create" REMOTEID="${escapeXml(guid)}">
        <DATE>${tallyDate(row.incomeDate)}</DATE>
        <GUID>${escapeXml(guid)}</GUID>
        <VOUCHERNUMBER>${escapeXml(vchNumber)}</VOUCHERNUMBER>
        <NARRATION>${narr}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(bankLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(party)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${amt}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>`.trim();
}

export function buildTallyImportEnvelope(innerVouchersXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY></SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${innerVouchersXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
