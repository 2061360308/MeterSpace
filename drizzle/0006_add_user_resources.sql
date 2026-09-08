-- 添加用户资源表：我的镜像、我的 Features、我的脚本

CREATE TABLE IF NOT EXISTS "user_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"description" text,
	"image_uri" text NOT NULL,
	"architecture" text DEFAULT 'amd64',
	"source" text,
	"marketplace_id" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"description" text,
	"feature_uri" text NOT NULL,
	"options" jsonb DEFAULT '{}',
	"source" text,
	"marketplace_id" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"description" text,
	"script" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_images_user" ON "user_images" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_features_user" ON "user_features" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_scripts_user" ON "user_scripts" ("user_id");