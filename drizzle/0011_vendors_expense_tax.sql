CREATE TABLE IF NOT EXISTS "vendors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"gstin" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_tenant_slug_unique" ON "vendors" USING btree ("tenant_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_tenant_id_idx" ON "vendors" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vendor_id" varchar;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "base_amount" integer;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "tax_amount" integer;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "tax_rate" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "recurring_expense_templates" ADD COLUMN IF NOT EXISTS "vendor_id" varchar;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
