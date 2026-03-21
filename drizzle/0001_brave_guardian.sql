ALTER TABLE "expense_categories" ADD COLUMN "cashflow_section" text DEFAULT 'operating_outflow' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "pnl_section" text DEFAULT 'indirect' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "drilldown_mode" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "mis_display_label" text;--> statement-breakpoint
ALTER TABLE "finjoe_settings" ADD COLUMN "fy_start_month" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN "mis_classification" text DEFAULT 'revenue' NOT NULL;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN "revenue_group" text;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN "mis_display_label" text;