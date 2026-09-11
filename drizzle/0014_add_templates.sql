-- Template protocol: payload storage in DB + template registry.
-- See docs/FINAL-PLAN.md §3.1 (data model) and §8.1 (change list).

-- === 模板：含自带载荷的只读配方 ===
CREATE TABLE IF NOT EXISTS "templates" (
  "id"         text PRIMARY KEY,
  "user_id"    uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "definition" jsonb NOT NULL,
  "payload"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version"    text DEFAULT '1',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_templates_user" ON "templates"("user_id");
--> statement-breakpoint

-- === 工作区载荷：逐文件存，用户可编辑 ===
CREATE TABLE IF NOT EXISTS "workspace_payloads" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "path"         text NOT NULL,
  "content"      text NOT NULL DEFAULT '',
  "mode"         text NOT NULL DEFAULT '0644',
  "size"         integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz DEFAULT now(),
  "updated_at"   timestamptz DEFAULT now(),
  UNIQUE ("workspace_id", "path")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_payloads_ws" ON "workspace_payloads"("workspace_id");
--> statement-breakpoint

-- === workspaces：模板实例化相关字段 ===
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "template_id" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "template_version" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "template_params" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "entry" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "activity_config" jsonb;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "entry_timeout" integer DEFAULT 1800;
--> statement-breakpoint
-- 模板实例的工作区不再强制要求镜像
ALTER TABLE "workspaces" ALTER COLUMN "image_uri" DROP NOT NULL;
--> statement-breakpoint

-- === instances：运行时诊断字段 ===
-- last_heartbeat_at 已在 0013 添加
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "current_entry" text;
--> statement-breakpoint

-- === 索引：热点查询 ===
CREATE INDEX IF NOT EXISTS "idx_instances_heartbeat" ON "instances"("last_heartbeat_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_instances_idle" ON "instances"("status", "last_active_at") WHERE "status" = 'RUNNING';
