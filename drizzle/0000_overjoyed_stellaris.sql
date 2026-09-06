CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "git_tokens" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"token_enc" text NOT NULL,
	"username" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "git_tokens_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"ali_access_key_id" text NOT NULL,
	"ali_access_secret" text NOT NULL,
	"default_region" text DEFAULT 'cn-hangzhou',
	"default_spec" text DEFAULT 'ecs.g6.xlarge',
	"default_disk_category" text DEFAULT 'cloud_essd',
	"default_disk_size" integer DEFAULT 40,
	"default_bandwidth" integer DEFAULT 10,
	"default_release_hours" integer DEFAULT 4,
	"default_idle_minutes" integer DEFAULT 30,
	"default_spot_strategy" text DEFAULT 'NoSpot',
	"default_spot_duration" integer DEFAULT 1,
	"acr_instance_id" text,
	"oss_bucket" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workspace_states" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'STOPPED',
	"instance_id" text,
	"public_ip" text,
	"port" integer,
	"access_token" text,
	"health_callback" boolean DEFAULT false,
	"last_active_at" timestamp with time zone,
	"idle_triggered" boolean DEFAULT false,
	"oss_usage_bytes" bigint,
	"released_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"instance_type" text NOT NULL,
	"disk_category" text DEFAULT 'cloud_essd',
	"disk_size" integer DEFAULT 40,
	"bandwidth" integer DEFAULT 10,
	"public_ip" boolean DEFAULT true,
	"spot_strategy" text DEFAULT 'NoSpot',
	"spot_duration" integer DEFAULT 1,
	"spot_price_limit" numeric(8, 4),
	"image_uri" text NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb,
	"git_provider" text,
	"git_repo_url" text,
	"git_branch" text DEFAULT 'main',
	"git_token_enc" text,
	"auto_clone" boolean DEFAULT true,
	"release_hours" integer,
	"idle_minutes" integer,
	"oss_workspace_path" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_tokens" ADD CONSTRAINT "git_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_states" ADD CONSTRAINT "workspace_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;