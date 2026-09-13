-- 基础网络资源（VPC / VSwitch / 镜像 / 共享安全组）落库。
--
-- 原先这些 ID 只存在于 `lib/ecs/provisioning.ts` 的进程内 Map，serverless 冷启动即失效，
-- 导致每次冷启动都要重打 4 次云 API 才凑得齐 RunInstances 的参数。
-- 落库后冷启动只是一次 DB 读；建 ECS 全程只剩 2 次云 API（安全组查询 + RunInstances）。
CREATE TABLE IF NOT EXISTS "region_resources" (
	"provider" text DEFAULT 'aliyun' NOT NULL,
	"user_id" uuid NOT NULL,
	"region" text NOT NULL,
	"image_id" text NOT NULL,
	"vpc_id" text NOT NULL,
	"v_switch_id" text NOT NULL,
	"security_group_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"refreshed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "region_resources_provider_user_id_region_pk" PRIMARY KEY("provider","user_id","region")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "region_resources" ADD CONSTRAINT "region_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
