export type KbCategoryId =
  | "getting-started"
  | "dashboard"
  | "whatsapp"
  | "people"
  | "expenses-income"
  | "integrations"
  | "reports"
  | "data-handling"
  | "finance";

export type MockScreenVariant = "dashboard" | "finjoe";

export interface MockScreenSpec {
  variant: MockScreenVariant;
  /** Which region to emphasize in the wireframe */
  highlight?: "sidebar" | "main" | "header" | "settings" | "nav";
  caption?: string;
  /** Optional screenshot under `client/public/` e.g. `/kb/expenses.png`. When set, image is shown (wireframe hidden). */
  imageSrc?: string;
  /** Alt text for screenshot; falls back to caption */
  imageAlt?: string;
}

export interface KbStep {
  title?: string;
  body: string;
  mockScreen?: MockScreenSpec;
}

export interface KbArticle {
  slug: string;
  title: string;
  summary: string;
  category: KbCategoryId;
  steps: KbStep[];
}
