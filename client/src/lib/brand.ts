/**
 * FinJoe brand constants — colors, copy, and design tokens.
 * Pantone-inspired palette: Teal (trust, growth) + Gold (success, premium).
 */

export const BRAND = {
  /** Primary teal — PANTONE 7472 C */
  primary: "#0d9488",
  primaryDark: "#0f766e",
  /** Accent gold — PANTONE 7559 C */
  accent: "#d4a853",
  /** Neutral slate */
  neutral: {
    dark: "#1e293b",
    mid: "#64748b",
    light: "#94a3b8",
  },
  background: "#f8fafc",
  backgroundDark: "#0f172a",
} as const;

export const COPY = {
  tagline: "WhatsApp AI for expense and income management",
  heroHeadline: "Finance Joe — Your AI Finance Assistant on WhatsApp",
  heroSubhead:
    "Post expenses, receipts, and income. Get dashboards, planning, and accounting. All through WhatsApp.",
  ctaLogin: "Log in to Admin",
  ctaGetStarted: "Get Started",
  valueProps: [
    { title: "WhatsApp-first", description: "Use the app you already use every day. No new tools to learn." },
    { title: "Expense & income tracking", description: "Post receipts, expenses, and income. Finance Joe organizes everything." },
    { title: "Dashboards & reports", description: "Clear insights and planning at a glance." },
    { title: "AI-powered insights", description: "Smart categorization and answers to your finance questions." },
  ],
  howItWorks: [
    { step: 1, title: "Add your contacts", description: "Admins add WhatsApp contacts to Finance Joe." },
    { step: 2, title: "Post via WhatsApp", description: "Users send expenses, receipts, and income to Finance Joe." },
    { step: 3, title: "Get insights", description: "Dashboards, reports, and AI-powered planning." },
  ],
} as const;
