ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "cashflow_section" text DEFAULT 'operating_outflow' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "pnl_section" text DEFAULT 'indirect' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "drilldown_mode" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN IF NOT EXISTS "mis_display_label" text;--> statement-breakpoint
ALTER TABLE "finjoe_settings" ADD COLUMN IF NOT EXISTS "fy_start_month" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN IF NOT EXISTS "mis_classification" text DEFAULT 'revenue' NOT NULL;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN IF NOT EXISTS "revenue_group" text;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN IF NOT EXISTS "mis_display_label" text;