/** Allowed values for direct expense payout (vendor payment). Petty-cash reimbursement uses replenishment, not these strings. */
export const VALID_EXPENSE_PAYOUT_METHODS = [
  "bank_transfer",
  "upi",
  "cash",
  "cheque",
  "demand_draft",
] as const;

export type ExpensePayoutMethod = (typeof VALID_EXPENSE_PAYOUT_METHODS)[number];

export function isValidExpensePayoutMethod(value: unknown): value is ExpensePayoutMethod {
  return typeof value === "string" && (VALID_EXPENSE_PAYOUT_METHODS as readonly string[]).includes(value);
}

/** Cash may omit a bank/UPI reference; other methods should collect a reference in the UI. */
export function isPayoutRefOptionalForMethod(method: string): boolean {
  return method === "cash";
}

export function payoutRefFieldLabel(method: string): string {
  switch (method) {
    case "bank_transfer":
      return "UTR / bank reference";
    case "upi":
      return "UPI reference / UTR";
    case "cash":
      return "Note (optional)";
    case "cheque":
      return "Cheque number";
    case "demand_draft":
      return "DD number / reference";
    default:
      return "Transaction reference";
  }
}

export function payoutRefPlaceholder(method: string): string {
  switch (method) {
    case "bank_transfer":
      return "e.g. NEFT/RTGS UTR";
    case "upi":
      return "e.g. UPI ref or UTR";
    case "cash":
      return "Optional note";
    case "cheque":
      return "Cheque number";
    case "demand_draft":
      return "DD number";
    default:
      return "Reference";
  }
}

/**
 * Best-effort extraction of UTR / reference from a WhatsApp message when the model omits payoutRef.
 * Prefer explicit labels (UTR, ref) then long digit runs common for Indian bank UTRs.
 */
export function extractPayoutRefFromMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const labeled = /(?:utr|reference|ref|txn|transaction\s*(?:id|no\.?)?)[\s:]*([0-9A-Za-z][0-9A-Za-z\s-]{6,40})/i.exec(trimmed);
  if (labeled?.[1]) {
    const cleaned = labeled[1].replace(/\s+/g, " ").trim();
    if (cleaned.length >= 6) return cleaned;
  }
  const digitRun = /\b(\d{12,22})\b/.exec(trimmed);
  if (digitRun?.[1]) return digitRun[1];
  const alnum = /\b([A-Z0-9]{10,24})\b/i.exec(trimmed);
  if (alnum?.[1] && /\d/.test(alnum[1])) return alnum[1];
  return undefined;
}
