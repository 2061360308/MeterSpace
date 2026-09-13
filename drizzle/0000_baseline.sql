-- ============================================================================
-- 0000_baseline.sql —— MeterSpace 数据库基线（合并 0000–0021 后的单一入口）
--
-- 由线上库反向导出生成（pg_catalog），非逐条拼接历史迁移。
-- 历史迁移原件已归档至 .workbuddy/drizzle-archive-2026-09-13/
-- 自本文件起，迁移账本改用 _app_migrations 单表口径，idx 从 0 重新计数。
--
-- 生成时间: 2026-09-13T14:29:47.912Z
-- 表数: 21
--
-- ⚠️ 本文件描述的是「当前线上结构」；新变更请另建 0001_xxx.sql，勿改本文件。
-- ============================================================================

-- ---------------------------- api_keys ----------------------------
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY (id);

-- ---------------------------- audit_logs ----------------------------
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);

-- ---------------------------- cloud_instances ----------------------------
CREATE TABLE IF NOT EXISTS "cloud_instances" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'aliyun'::text NOT NULL,
	"region" text NOT NULL,
	"instance_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "cloud_instances" ADD CONSTRAINT "cloud_instances_pkey" PRIMARY KEY (id);

-- ---------------------------- env_variables ----------------------------
CREATE TABLE IF NOT EXISTS "env_variables" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "env_variables" ADD CONSTRAINT "env_variables_pkey" PRIMARY KEY (id);

-- ---------------------------- git_tokens ----------------------------
CREATE TABLE IF NOT EXISTS "git_tokens" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"token_enc" text NOT NULL,
	"username" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "git_tokens" ADD CONSTRAINT "git_tokens_user_id_provider_pk" PRIMARY KEY (user_id, provider);

-- ---------------------------- instance_access_codes ----------------------------
CREATE TABLE IF NOT EXISTS "instance_access_codes" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"code" text NOT NULL,
	"is_personal" boolean DEFAULT false,
	"allowed_ports" integer[] DEFAULT '{8080}'::integer[],
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "instance_access_codes" ADD CONSTRAINT "instance_access_codes_pkey" PRIMARY KEY (id);
ALTER TABLE "instance_access_codes" ADD CONSTRAINT "instance_access_codes_code_unique" UNIQUE (code);

-- ---------------------------- instance_cache ----------------------------
CREATE TABLE IF NOT EXISTS "instance_cache" (
	"provider" text DEFAULT 'aliyun'::text NOT NULL,
	"region" text NOT NULL,
	"instance_type" text NOT NULL,
	"cpu_core_count" integer NOT NULL,
	"memory_size" real NOT NULL,
	"gpu_count" integer DEFAULT 0 NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now(),
	"instance_type_family" text,
	"cpu_architecture" text,
	"gpu_spec" text
);
ALTER TABLE "instance_cache" ADD CONSTRAINT "instance_cache_provider_region_instance_type_pk" PRIMARY KEY (provider, region, instance_type);

-- ---------------------------- instance_logs ----------------------------
CREATE TABLE IF NOT EXISTS "instance_logs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"level" text NOT NULL,
	"phase" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "instance_logs" ADD CONSTRAINT "instance_logs_pkey" PRIMARY KEY (id);

-- ---------------------------- instance_scripts ----------------------------
CREATE TABLE IF NOT EXISTS "instance_scripts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"script" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "instance_scripts" ADD CONSTRAINT "instance_scripts_pkey" PRIMARY KEY (id);

-- ---------------------------- instances ----------------------------
CREATE TABLE IF NOT EXISTS "instances" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"disk_size" integer DEFAULT 40 NOT NULL,
	"bandwidth" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'PROVISIONING'::text NOT NULL,
	"ecs_instance_id" text,
	"public_ip" text,
	"port" integer,
	"access_token" text,
	"boot_phase" text,
	"boot_started_at" timestamp with time zone,
	"boot_completed_at" timestamp with time zone,
	"boot_error" text,
	"last_active_at" timestamp with time zone,
	"idle_triggered" boolean DEFAULT false,
	"oss_usage_bytes" bigint,
	"stopped_at" timestamp with time zone,
	"stop_reason" text,
	"logs_expire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"cloud_instance_id" uuid,
	"cpu_percent" real,
	"memory_mb" integer,
	"memory_total_mb" integer,
	"disk_mb" integer,
	"disk_total_mb" integer,
	"access_summary" jsonb,
	"security_group_id" text,
	"last_heartbeat_at" timestamp with time zone,
	"current_entry" text,
	"stop_invoke_id" text,
	"release_requested_at" timestamp with time zone,
	"provision_claimed_at" timestamp with time zone,
	"use_spot" boolean DEFAULT false NOT NULL
);
ALTER TABLE "instances" ADD CONSTRAINT "instances_pkey" PRIMARY KEY (id);

-- ---------------------------- launch_templates ----------------------------
CREATE TABLE IF NOT EXISTS "launch_templates" (
	"id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text DEFAULT '1'::text,
	"origin_recipe_id" text,
	"origin_kind" text DEFAULT 'upload'::text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "launch_templates" ADD CONSTRAINT "launch_templates_pkey" PRIMARY KEY (id);

-- ---------------------------- price_cache ----------------------------
CREATE TABLE IF NOT EXISTS "price_cache" (
	"provider" text DEFAULT 'aliyun'::text NOT NULL,
	"region" text NOT NULL,
	"instance_type" text NOT NULL,
	"on_demand_price" real,
	"historical_discount" real,
	"release_rate" real,
	"refreshed_at" timestamp with time zone
);
ALTER TABLE "price_cache" ADD CONSTRAINT "price_cache_provider_region_instance_type_pk" PRIMARY KEY (provider, region, instance_type);

-- ---------------------------- price_quote_cache ----------------------------
CREATE TABLE IF NOT EXISTS "price_quote_cache" (
	"provider" text DEFAULT 'aliyun'::text NOT NULL,
	"region" text NOT NULL,
	"instance_type" text NOT NULL,
	"disk_category" text DEFAULT 'cloud_essd'::text NOT NULL,
	"disk_size" integer NOT NULL,
	"bandwidth" integer NOT NULL,
	"spot_strategy" text DEFAULT 'NoSpot'::text NOT NULL,
	"spot_duration" integer DEFAULT 1 NOT NULL,
	"details" jsonb NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "price_quote_cache" ADD CONSTRAINT "price_quote_cache_pk" PRIMARY KEY (provider, region, instance_type, disk_category, disk_size, bandwidth, spot_strategy, spot_duration);

-- ---------------------------- recipes ----------------------------
CREATE TABLE IF NOT EXISTS "recipes" (
	"id" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text DEFAULT '1'::text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_pkey" PRIMARY KEY (id);

-- ---------------------------- region_resources ----------------------------
CREATE TABLE IF NOT EXISTS "region_resources" (
	"provider" text DEFAULT 'aliyun'::text NOT NULL,
	"user_id" uuid NOT NULL,
	"region" text NOT NULL,
	"image_id" text NOT NULL,
	"vpc_id" text NOT NULL,
	"v_switch_id" text NOT NULL,
	"security_group_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"refreshed_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "region_resources" ADD CONSTRAINT "region_resources_provider_user_id_region_pk" PRIMARY KEY (provider, user_id, region);

-- ---------------------------- settings ----------------------------
CREATE TABLE IF NOT EXISTS "settings" (
	"user_id" uuid NOT NULL,
	"ali_access_key_id" text NOT NULL,
	"ali_access_secret" text NOT NULL,
	"default_region" text DEFAULT 'cn-hangzhou'::text,
	"default_spec" text DEFAULT 'ecs.g6.xlarge'::text,
	"default_disk_category" text DEFAULT 'cloud_essd'::text,
	"default_disk_size" integer DEFAULT 40,
	"default_bandwidth" integer DEFAULT 10,
	"default_release_hours" real DEFAULT 0.5,
	"default_idle_minutes" integer DEFAULT 30,
	"default_spot_strategy" text DEFAULT 'NoSpot'::text,
	"default_spot_duration" integer DEFAULT 1,
	"acr_instance_id" text,
	"oss_bucket" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	"enabled_regions" jsonb DEFAULT '["cn-hangzhou"]'::jsonb,
	"log_retention_days" integer DEFAULT 7,
	"github_mirror" text,
	"docker_mirror" text,
	"proxy_mode" text DEFAULT 'disabled'::text,
	"proxy_clash_subscription" text,
	"proxy_clash_yaml" text,
	"proxy_upstream_url" text,
	"proxy_upstream_username" text,
	"proxy_upstream_secret" text,
	"proxy_probe_urls" jsonb DEFAULT '[]'::jsonb,
	"proxy_bypass" jsonb DEFAULT '[]'::jsonb,
	"clash_bin_url" text
);
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY (user_id);

-- ---------------------------- storage_volumes ----------------------------
CREATE TABLE IF NOT EXISTS "storage_volumes" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mount_path" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "storage_volumes" ADD CONSTRAINT "storage_volumes_pkey" PRIMARY KEY (id);

-- ---------------------------- users ----------------------------
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE (username);

-- ---------------------------- workspace_payloads ----------------------------
CREATE TABLE IF NOT EXISTS "workspace_payloads" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text DEFAULT ''::text NOT NULL,
	"mode" text DEFAULT '0644'::text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE "workspace_payloads" ADD CONSTRAINT "workspace_payloads_pkey" PRIMARY KEY (id);
ALTER TABLE "workspace_payloads" ADD CONSTRAINT "workspace_payloads_workspace_id_path_key" UNIQUE (workspace_id, path);

-- ---------------------------- workspace_states ----------------------------
CREATE TABLE IF NOT EXISTS "workspace_states" (
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'STOPPED'::text,
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
ALTER TABLE "workspace_states" ADD CONSTRAINT "workspace_states_pkey" PRIMARY KEY (workspace_id);

-- ---------------------------- workspaces ----------------------------
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"provider" text DEFAULT 'aliyun'::text NOT NULL,
	"default_disk_size" integer DEFAULT 40,
	"default_bandwidth" integer DEFAULT 10,
	"public_ip" boolean DEFAULT true,
	"image_uri" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"git_provider" text,
	"git_repo_url" text,
	"git_branch" text DEFAULT 'main'::text,
	"git_token_enc" text,
	"auto_clone" boolean DEFAULT true,
	"release_hours" integer,
	"idle_minutes" integer,
	"oss_workspace_path" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"proxy_mode" text DEFAULT 'inherit'::text,
	"proxy_clash_subscription" text,
	"proxy_clash_yaml" text,
	"proxy_upstream_url" text,
	"proxy_upstream_username" text,
	"proxy_upstream_secret" text,
	"template_id" text,
	"template_version" text,
	"template_params" jsonb DEFAULT '{}'::jsonb,
	"entry" text,
	"activity_config" jsonb,
	"entry_timeout" integer DEFAULT 1800
);
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY (id);

-- ---------------------------- 索引 ----------------------------
CREATE INDEX idx_access_codes_code ON instance_access_codes USING btree (code);
CREATE INDEX idx_access_codes_instance ON instance_access_codes USING btree (instance_id);
CREATE INDEX idx_instance_logs_instance ON instance_logs USING btree (instance_id, "timestamp");
CREATE INDEX idx_instances_heartbeat ON instances USING btree (last_heartbeat_at);
CREATE INDEX idx_instances_idle ON instances USING btree (status, last_active_at) WHERE (status = 'RUNNING'::text);
CREATE INDEX idx_instances_provisioning ON instances USING btree (status, ecs_instance_id);
CREATE INDEX idx_instances_releasing ON instances USING btree (status, release_requested_at);
CREATE INDEX idx_instances_status ON instances USING btree (status);
CREATE INDEX idx_instances_workspace ON instances USING btree (workspace_id);
CREATE INDEX idx_launch_templates_user ON launch_templates USING btree (user_id);
CREATE INDEX idx_recipes_user ON recipes USING btree (user_id);
CREATE INDEX idx_workspace_payloads_ws ON workspace_payloads USING btree (workspace_id);

-- ---------------------------- 外键 ----------------------------
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE "cloud_instances" ADD CONSTRAINT "cloud_instances_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "env_variables" ADD CONSTRAINT "env_variables_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "git_tokens" ADD CONSTRAINT "git_tokens_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "instance_access_codes" ADD CONSTRAINT "instance_access_codes_instance_id_instances_id_fk" FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE;
ALTER TABLE "instance_logs" ADD CONSTRAINT "instance_logs_instance_id_instances_id_fk" FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE;
ALTER TABLE "instance_scripts" ADD CONSTRAINT "instance_scripts_workspace_id_workspaces_id_fk" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "instances" ADD CONSTRAINT "instances_cloud_instance_id_cloud_instances_id_fk" FOREIGN KEY (cloud_instance_id) REFERENCES cloud_instances(id) ON DELETE SET NULL;
ALTER TABLE "instances" ADD CONSTRAINT "instances_workspace_id_workspaces_id_fk" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "launch_templates" ADD CONSTRAINT "launch_templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "region_resources" ADD CONSTRAINT "region_resources_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "storage_volumes" ADD CONSTRAINT "storage_volumes_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE "workspace_payloads" ADD CONSTRAINT "workspace_payloads_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "workspace_states" ADD CONSTRAINT "workspace_states_workspace_id_workspaces_id_fk" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
