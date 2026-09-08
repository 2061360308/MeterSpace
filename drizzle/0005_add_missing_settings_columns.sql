ALTER TABLE "settings" ADD COLUMN "log_retention_days" integer DEFAULT 7;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "github_mirror" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "docker_mirror" text;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "default_release_hours" SET DATA TYPE real USING "default_release_hours"::real;