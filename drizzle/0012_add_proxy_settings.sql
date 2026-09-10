-- Global network proxy settings (settings table)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_mode" text DEFAULT 'disabled';
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_clash_subscription" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_clash_yaml" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_upstream_url" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_upstream_username" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_upstream_secret" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_probe_urls" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "proxy_bypass" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "clash_bin_url" text;
--> statement-breakpoint
-- Per-workspace proxy override
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "proxy_mode" text DEFAULT 'inherit';
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "proxy_clash_subscription" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "proxy_clash_yaml" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "proxy_upstream_url" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "proxy_upstream_username" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "proxy_upstream_secret" text;