import type { KbArticle, KbCategoryId } from "./types";

export const KB_CATEGORY_LABELS: Record<KbCategoryId, string> = {
  "getting-started": "Getting started",
  dashboard: "Dashboard",
  whatsapp: "WhatsApp & capture",
  people: "People & access",
  "expenses-income": "Expenses & income",
  integrations: "Integrations",
  reports: "Reports",
  "data-handling": "Data handling",
  finance: "Invoicing & reconciliation",
};

export const KB_ARTICLES: KbArticle[] = [
  {
    slug: "navigate-finjoe-workspace",
    category: "getting-started",
    title: "Navigate the FinJoe workspace",
    summary: "Cost centers, contacts, settings, and exports—where everything lives under FinJoe in admin.",
    steps: [
      {
        title: "Open FinJoe from the sidebar",
        body: "In the left sidebar, click FinJoe. You’ll see section tabs: Cost centers, Contacts, Dashboard users, Role requests, Accounting export, and Settings.",
        mockScreen: {
          variant: "finjoe",
          highlight: "nav",
          caption: "FinJoe sub-navigation sits below the main page title.",
        },
      },
      {
        title: "Structure first",
        body: "Use Cost centers to align expenses and reporting. Then add WhatsApp contacts so capture has a destination.",
        mockScreen: { variant: "finjoe", highlight: "main", caption: "Main workspace content updates per tab." },
      },
      {
        title: "Settings last",
        body: "Under Settings, connect templates, notifications, and channel details. Save changes before testing WhatsApp flows.",
        mockScreen: { variant: "finjoe", highlight: "settings", caption: "Integration and channel settings are centralized here." },
      },
    ],
  },
  {
    slug: "dashboard-overview",
    category: "dashboard",
    title: "Use the Dashboard",
    summary: "High-level cash, activity, and shortcuts—your first stop after sign-in.",
    steps: [
      {
        body: "Open Dashboard from the sidebar. You’ll see a financial scoreboard, AI-powered insights, cash-flow trends, and expense breakdowns for your tenant.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "KPI scoreboard, FinJoe Intelligence Brief, and trend charts give you a real-time financial overview." },
      },
      {
        body: "Use the sidebar to jump to Reports, FinJoe, or transaction areas without losing your place—Help stays at the bottom for guides.",
        mockScreen: { variant: "dashboard", highlight: "sidebar", caption: "Primary modules live in the left rail." },
      },
      {
        body: "If you use multiple workspaces (super admin), confirm the tenant selector matches the org you’re configuring before changing data.",
        mockScreen: { variant: "dashboard", highlight: "header", caption: "Tenant context appears in the shell when applicable." },
      },
    ],
  },
  {
    slug: "add-whatsapp-contact",
    category: "whatsapp",
    title: "Add a WhatsApp contact",
    summary: "Register finance or operations numbers so FinJoe can message the right people.",
    steps: [
      {
        body: "Go to FinJoe → Contacts. You’ll manage WhatsApp numbers that receive summaries and workflows.",
        mockScreen: { variant: "finjoe", highlight: "main", caption: "Contacts list and add flow live on this tab." },
      },
      {
        body: "Add a contact with the correct country code. Match the number to the WhatsApp Business setup your admin configured.",
      },
      {
        body: "After saving, use Settings to confirm templates and notification emails are filled in—your team gets predictable messages.",
        mockScreen: { variant: "finjoe", highlight: "settings", caption: "Templates and Resend settings tie contacts to outbound mail." },
      },
    ],
  },
  {
    slug: "invite-dashboard-user",
    category: "people",
    title: "Invite a dashboard user",
    summary: "Add colleagues who should sign in to FinJoe Admin—not just WhatsApp submitters.",
    steps: [
      {
        body: "Open FinJoe → Dashboard users (admins only). This is where org accounts are created or invited.",
        mockScreen: { variant: "finjoe", highlight: "main", caption: "User list and invite actions appear here." },
      },
      {
        body: "Send an invite or add a user with the right role. Finance vs admin roles control which FinJoe sections appear.",
      },
      {
        body: "If someone only needs approval flows, Role requests may be their entry—direct them there from the sidebar.",
        mockScreen: { variant: "dashboard", highlight: "sidebar", caption: "Role requests are available without full FinJoe config access." },
      },
    ],
  },
  {
    slug: "expenses-capture-and-review",
    category: "expenses-income",
    title: "Expenses: capture and review",
    summary: "Record, categorize, and approve spend—aligned with WhatsApp and admin workflows.",
    steps: [
      {
        body: "Go to Expenses in the sidebar. Create or import lines, assign categories and cost centers, and submit for approval when required.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Expense list and detail panels live in this module." },
      },
      {
        body: "Many teams capture first on WhatsApp; admins reconcile and adjust in Expenses so the ledger stays clean.",
      },
      {
        body: "Use filters and date ranges to audit periods before month-end close or export.",
        mockScreen: { variant: "dashboard", highlight: "sidebar", caption: "Jump between modules from the same rail." },
      },
    ],
  },
  {
    slug: "income-records-overview",
    category: "expenses-income",
    title: "Income records",
    summary: "Track money in with categories and types consistent with your finance policy.",
    steps: [
      {
        body: "Open Income from the sidebar. Add receipts, classify by income type, and link to customers or internal references as your process requires.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Income list mirrors the expense experience for parity." },
      },
      {
        body: "Align income categories with reporting and tax treatment your leadership expects—edit master data before bulk entry.",
      },
    ],
  },
  {
    slug: "recurring-templates-overview",
    category: "expenses-income",
    title: "Recurring expense and income templates",
    summary: "Automate predictable entries so operations spend less time on repetitive posting.",
    steps: [
      {
        body: "Use Recurring Expenses and Recurring Income in the sidebar. Each opens a template list scoped to that flow.",
        mockScreen: { variant: "dashboard", highlight: "sidebar", caption: "Dedicated sidebar entries for recurring automation." },
      },
      {
        body: "Define amount, cadence, category, and effective dates. Pause or retire templates when contracts change.",
      },
      {
        body: "Confirm cron or scheduled jobs (platform team) are enabled so templates actually post—ask your admin if nothing generates.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Template tables and edit dialogs live in each module." },
      },
    ],
  },
  {
    slug: "reports-mis-and-exports",
    category: "reports",
    title: "Reports and exports",
    summary: "Spreadsheet-friendly views and MIS-style summaries for finance review.",
    steps: [
      {
        body: "Open Reports. Pick dimensions your org cares about—time, cost center, category—and export when you need Excel or CSV.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Report grids and export actions are centralized here." },
      },
      {
        body: "Coordinate with Data handling if you need raw dumps versus summarized MIS output.",
      },
    ],
  },
  {
    slug: "data-handling-workspace",
    category: "data-handling",
    title: "Data handling",
    summary: "Exports, retention, and privacy-aligned handling for your tenant’s finance data.",
    steps: [
      {
        body: "Open Data Handling from the sidebar. Review what can be exported, who may trigger exports, and any retention notes your policy requires.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Policies and export tools appear in this dedicated area." },
      },
      {
        body: "Super admins switching tenants should confirm the correct workspace before exporting—exports are tenant-scoped.",
        mockScreen: { variant: "dashboard", highlight: "header", caption: "Match tenant context before sensitive actions." },
      },
    ],
  },
  {
    slug: "accounting-export-overview",
    category: "integrations",
    title: "Accounting export overview",
    summary: "High-level path from FinJoe to your accounting tool.",
    steps: [
      {
        body: "Open FinJoe → Accounting export. Choose your period and format based on what your accountant expects.",
        mockScreen: { variant: "finjoe", highlight: "main", caption: "Export options and preview live on this screen." },
      },
      {
        body: "Resolve any blocking issues shown on the page (missing mappings, closed periods) before downloading.",
      },
      {
        body: "For chart-of-accounts alignment, complete integrations under Settings → exports path referenced by your workspace.",
      },
    ],
  },
  {
    slug: "invoicing-and-reconciliation",
    category: "finance",
    title: "Invoicing and reconciliation",
    summary: "Where to manage customer invoices, payments, and bank reconciliation in the admin.",
    steps: [
      {
        body: "Use Invoicing in the main sidebar for customer invoices, PDFs, and payment links.",
        mockScreen: { variant: "dashboard", highlight: "sidebar", caption: "Invoicing sits alongside expenses and income." },
      },
      {
        body: "Use Reconciliation when matching bank lines to posted income and expenses.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Reconciliation workspace for review and matching." },
      },
      {
        body: "Keep tenant and period context consistent—switch workspace from the header if you manage multiple orgs (super admin).",
        mockScreen: { variant: "dashboard", highlight: "header", caption: "Tenant switcher appears when available." },
      },
    ],
  },
  {
    slug: "invoicing-customers-and-payment-links",
    category: "finance",
    title: "Customers, invoices, and payment links",
    summary: "Maintain billing master data and share pay URLs with customers.",
    steps: [
      {
        body: "From Invoicing, manage customers (legal name, tax IDs, contacts) before raising invoices—clean master data reduces disputes.",
        mockScreen: { variant: "dashboard", highlight: "main", caption: "Customer and invoice lists share the same workspace patterns." },
      },
      {
        body: "Create invoices with line items and taxes per your jurisdiction. Generate PDFs for email and audit trails.",
      },
      {
        body: "Enable payment links or hosted checkout where configured so customers can pay without manual bank reconciliation first.",
        mockScreen: { variant: "dashboard", highlight: "settings", caption: "Payment and gateway settings may live under invoice options." },
      },
    ],
  },
];

export function getKbArticle(slug: string): KbArticle | undefined {
  return KB_ARTICLES.find((a) => a.slug === slug);
}

export function groupArticlesByCategory(articles: KbArticle[]): Map<KbArticle["category"], KbArticle[]> {
  const map = new Map<KbArticle["category"], KbArticle[]>();
  for (const a of articles) {
    const list = map.get(a.category) ?? [];
    list.push(a);
    map.set(a.category, list);
  }
  return map;
}
