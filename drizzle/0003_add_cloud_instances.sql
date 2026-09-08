CREATE TABLE "cloud_instances" (
  "id"            uuid    NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "name"          text    NOT NULL,
  "provider"      text    NOT NULL DEFAULT 'aliyun',
  "region"        text    NOT NULL,
  "instance_type" text    NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now(),
  "updated_at"    timestamp with time zone DEFAULT now(),
  CONSTRAINT "cloud_instances_pkey" PRIMARY KEY ("id")
);

-- 重构 workspaces 表：删除计算字段，新增 provider 和 cloud_instance_id
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "instance_type";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "spot_strategy";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "spot_duration";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "spot_price_limit";

ALTER TABLE "workspaces" ADD COLUMN "provider" text NOT NULL DEFAULT 'aliyun';
ALTER TABLE "workspaces" ADD COLUMN "cloud_instance_id" uuid NOT NULL REFERENCES "cloud_instances"("id");
