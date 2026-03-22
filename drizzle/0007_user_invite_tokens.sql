ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_expires_at" timestamp;
