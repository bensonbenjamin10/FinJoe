import type { KbArticle, KbCategoryId } from "./types";

export const KB_CATEGORY_LABELS: Record<KbCategoryId, string> = {
  "getting-started": "Getting started",
  whatsapp: "WhatsApp & capture",
  people: "People & access",
  integrations: "Integrations",
  finance: "Finance areas",
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
