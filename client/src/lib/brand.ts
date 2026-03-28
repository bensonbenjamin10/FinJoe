/**
 * FinJoe brand constants — colors, copy, and design tokens.
 * Logo palette: emerald green + amber gold + navy (see client/src/assets/finjoe-logo.png).
 */

export const BRAND = {
  /** Primary emerald — logo green */
  primary: "#16a34a",
  primaryDark: "#15803d",
  /** Accent amber — logo gold */
  accent: "#eab308",
  accentDeep: "#ca8a04",
  /** Navy — overlap / text contrast */
  navy: "#1e293b",
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
  heroBadge: "The intelligence layer for modern businesses",
  tagline:
    "FinJoe is building a complete intelligence layer for businesses—starting with finance, with more systems to follow.",
  heroHeadline: "Finance intelligence at the core of your business",
  heroSubhead:
    "Track every cash movement—in, out, and flow—with approvals traced and analysis that turns data into action. Delivered through WhatsApp and a powerful admin experience.",
  ctaLogin: "Log in to Admin",
  ctaGetStarted: "Get Started",
  intelligenceSectionTitle: "Built into the business, not bolted on",
  intelligenceSectionLead:
    "We’re building an intelligence layer that sits at the center of how companies run: capturing money movement, enforcing accountability, and surfacing what to do next.",
  intelligenceSectionPoints: [
    "Finance is our first product segment—deep visibility into cash, receipts, and workflows.",
    "Approvals and hand-offs stay traced so finance and leadership can trust the trail.",
    "Analysis isn’t an afterthought—it’s core to how FinJoe recommends and explains next steps.",
    "The same architecture will extend to other business systems over time.",
  ],
  intelligenceRoadmapHint: "Today: finance. Next: more of your operating stack.",
  featuresSectionTitle: "What you get with FinJoe",
  featuresSectionSubtitle:
    "WhatsApp for capture and collaboration, plus admin tools for control—grounded in traceable flows and real insights.",
  valueProps: [
    {
      title: "Intelligence layer, not another silo",
      description:
        "A unified approach to business intelligence—starting with finance and designed to grow into adjacent systems.",
    },
    {
      title: "Cash in, out, and flow—continuously",
      description:
        "See how money enters, leaves, and moves across your organization so gaps and patterns stand out early.",
    },
    {
      title: "Approvals you can trace",
      description:
        "Policies and sign-offs are recorded end to end—so audits and decisions rest on a clear, accountable trail.",
    },
    {
      title: "Insights you can act on",
      description:
        "Analysis sits at the core: trends, anomalies, and recommendations—not just static charts.",
    },
  ],
  howItWorksTitle: "How FinJoe fits your organization",
  howItWorksSubtitle:
    "Connect your team on WhatsApp, run finance with rigor in the admin, and let intelligence compound from real operational data.",
  howItWorks: [
    {
      step: 1,
      title: "Connect & configure",
      description:
        "Admins connect WhatsApp contacts, roles, and your Finance Joe workspace so capture and policy live in one place.",
    },
    {
      step: 2,
      title: "Capture, approve, trace",
      description:
        "Teams post income and expenses on WhatsApp; approvals and flows are tracked so nothing important slips through.",
    },
    {
      step: 3,
      title: "Analyze & decide",
      description:
        "Dashboards and AI surface patterns, risks, and opportunities—so leaders move from data to action faster.",
    },
  ],
  ctaTitle: "Ready to put finance intelligence at the center?",
  ctaDescription:
    "Sign up or log in to configure your organization, manage contacts and approvals, and unlock actionable insight from your cash flows.",
} as const;
