-- 模板体系重构 v3：把 templates 单表拆为 recipes + launch_templates 两张独立表。
-- 详见 docs/TEMPLATE-EDITOR.md §2。
--
-- 不变量：
--   recipes.payload 可含 {{param_key}} 占位符；recipes.params 可非空
--   launch_templates.params 永远为 []；launch_templates.payload 完全确定
--   两表互不引用，无 FK / 无 upstream_id
--
-- 现状（含恢复路径）：先建新表 → DO 块迁移 → 删旧表

-- === 配方：含 params 与占位符 payload ===
CREATE TABLE IF NOT EXISTS "recipes" (
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
CREATE INDEX IF NOT EXISTS "idx_recipes_user" ON "recipes"("user_id");
--> statement-breakpoint

-- === 启动模板：无 params，payload 已渲染；永远 source=user（结构层面 lock 住） ===
CREATE TABLE IF NOT EXISTS "launch_templates" (
  "id"         text PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "definition" jsonb NOT NULL,
  "payload"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version"    text DEFAULT '1',
  -- 审计：origin_recipe_id 仅为字符串（不建 FK）；删除 recipe 不级联
  "origin_recipe_id" text,
  "origin_kind"       text NOT NULL DEFAULT 'upload',
  -- origin_kind: 'recipe'（从某 recipe 衍生）/ 'upload'（用户直接上传 zip）
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_launch_templates_user" ON "launch_templates"("user_id");
--> statement-breakpoint

-- === 数据迁移：templates → recipes / launch_templates ===
-- 规则：definition.params 长度 > 0 视为配方（含占位符），其余视为启动模板。
-- 用 plpgsql DO 块在事务里逐行迁移，确保一致性。
DO $$
DECLARE
  r record;
  has_params boolean;
  origin text;
BEGIN
  -- 防御：templates 不存在则跳过迁移段（全新部署环境）
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'templates') THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM "templates" LOOP
    has_params := jsonb_typeof(r.definition->'params') = 'array'
                  AND jsonb_array_length((r.definition->'params')::jsonb) > 0;

    IF has_params THEN
      INSERT INTO "recipes" (id, user_id, name, definition, payload, version, created_at, updated_at)
      VALUES (r.id, r.user_id, r.name, r.definition, r.payload, r.version, r.created_at, r.updated_at)
      ON CONFLICT (id) DO NOTHING;
    ELSE
      origin := 'migration';
      INSERT INTO "launch_templates" (
        id, user_id, name, definition, payload, version,
        origin_recipe_id, origin_kind,
        created_at, updated_at
      )
      VALUES (
        r.id, r.user_id, r.name, r.definition, r.payload, r.version,
        NULL, origin,
        r.created_at, r.updated_at
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END$$;
--> statement-breakpoint

-- === 删旧表（迁移完成确认后） ===
DROP TABLE IF EXISTS "templates";
