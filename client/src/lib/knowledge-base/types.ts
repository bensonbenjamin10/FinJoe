export type KbCategoryId =
  | "getting-started"
  | "whatsapp"
  | "people"
  | "integrations"
  | "finance";

export type MockScreenVariant = "dashboard" | "finjoe";

export interface MockScreenSpec {
  variant: MockScreenVariant;
  /** Which region to emphasize in the wireframe */
  highlight?: "sidebar" | "main" | "header" | "settings" | "nav";
  caption?: string;
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
