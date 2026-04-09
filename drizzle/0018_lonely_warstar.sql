-- Approval workflow tables
CREATE TABLE IF NOT EXISTS "approval_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"entity_type" text DEFAULT 'expense' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_rule_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" varchar NOT NULL,
	"step_order" integer NOT NULL,
	"approver_type" text NOT NULL,
	"approver_value" text,
	"approval_mode" text DEFAULT 'any_one' NOT NULL,
	"can_reject" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_approval_scopes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"scope_type" text NOT NULL,
	"scope_value_id" text,
	"max_amount" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_approval_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" varchar NOT NULL,
	"rule_id" varchar NOT NULL,
	"step_id" varchar NOT NULL,
	"step_order" integer NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"assigned_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acted_by_id" varchar,
	"acted_at" timestamp,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approval_rule_steps" ADD CONSTRAINT "approval_rule_steps_rule_id_approval_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."approval_rules"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_approval_scopes" ADD CONSTRAINT "user_approval_scopes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_approval_scopes" ADD CONSTRAINT "user_approval_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expense_approval_steps" ADD CONSTRAINT "expense_approval_steps_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expense_approval_steps" ADD CONSTRAINT "expense_approval_steps_rule_id_approval_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."approval_rules"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expense_approval_steps" ADD CONSTRAINT "expense_approval_steps_step_id_approval_rule_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."approval_rule_steps"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expense_approval_steps" ADD CONSTRAINT "expense_approval_steps_acted_by_id_users_id_fk" FOREIGN KEY ("acted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Seed a default single-step approval rule for every existing tenant
INSERT INTO "approval_rules" ("tenant_id", "name", "entity_type", "is_active", "priority", "conditions", "is_default")
SELECT id, 'Default approval', 'expense', true, 0, '[]'::jsonb, true
FROM "tenants"
WHERE NOT EXISTS (
  SELECT 1 FROM "approval_rules" ar WHERE ar.tenant_id = tenants.id AND ar.is_default = true
);
--> statement-breakpoint
-- Create the single step (finance role) for each seeded default rule
INSERT INTO "approval_rule_steps" ("rule_id", "step_order", "approver_type", "approver_value", "approval_mode", "can_reject")
SELECT ar.id, 1, 'role', 'finance', 'any_one', true
FROM "approval_rules" ar
WHERE ar.is_default = true
AND NOT EXISTS (
  SELECT 1 FROM "approval_rule_steps" ars WHERE ars.rule_id = ar.id
);
