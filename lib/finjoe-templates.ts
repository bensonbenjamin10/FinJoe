/**
 * Canonical FinJoe WhatsApp template definitions.
 * Used by create-templates API and admin UI; mirrors scripts/create-finjoe-templates.mjs.
 */

export const FINJOE_TEMPLATE_DEFINITIONS = [
  {
    friendlyName: "finjoe_expense_approval",
    body: "Hello, a new expense request requires your approval. Expense reference #{{1}} for amount {{2}} is pending review. Please reply with APPROVE {{1}} to approve or REJECT {{1}} followed by a reason to reject. Thank you.",
    variables: { "1": "EXP001", "2": "₹50,000 - Vendor Name" },
  },
  {
    friendlyName: "finjoe_expense_approved",
    body: "Good news! Your expense submission has been approved. Expense reference #{{1}} is now processed. Thank you for following the expense workflow.",
    variables: { "1": "EXP001" },
  },
  {
    friendlyName: "finjoe_expense_rejected",
    body: "Your expense request reference #{{1}} has been rejected. The reason provided: {{2}} Please review the feedback, make the necessary corrections, and resubmit your expense. Contact your finance team if you need assistance.",
    variables: { "1": "EXP001", "2": "Reason not provided" },
  },
  {
    friendlyName: "finjoe_re_engagement",
    body: "Hello from Finance Joe! I'm here to help with expenses, income receipts, and any finance questions. Reply to get started or ask me anything.",
    variables: {},
  },
];
