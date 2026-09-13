/**
 * 仅跑 0019（拆表）迁移。应急用：完整脚本被中间失败阻塞时（比如中间某次 ALTER 阻塞）。
 *
 * 用法：
 *   DATABASE_URL=... npx tsx scripts/db-migrate-0019-only.ts
 */
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 未设置");
  process.exit(1);
}
const sql = neon(url);

async function run(text: string, params: unknown[] = []): Promise<void> {
  await sql.query(text.endsWith(";") ? text : text + ";", params);
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const rows = (await sql.query(
      "SELECT 1 AS x FROM information_schema.tables WHERE table_name = $1 LIMIT 1",
      [name],
    )) as Array<{ x: number }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function rowCount(name: string): Promise<number> {
  try {
    const rows = (await sql.query(
      `SELECT COUNT(*)::int AS n FROM "${name}"`,
      [],
    )) as Array<{ n: number }>;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

async function main() {
  const beforeRecipes = await tableExists("recipes");
  const beforeLaunch = await tableExists("launch_templates");
  const oldTemplatesCount = await rowCount("templates");
  console.log(
    `[0019-only] before: recipes=${beforeRecipes} launch_templates=${beforeLaunch} templates_rows=${oldTemplatesCount}`,
  );

  // 1. 建 recipes 表
  if (!beforeRecipes) {
    console.log("→ creating recipes");
    await run(`CREATE TABLE IF NOT EXISTS "recipes" (
      "id"         text PRIMARY KEY,
      "user_id"    uuid REFERENCES "users"("id") ON DELETE CASCADE,
      "name"       text NOT NULL,
      "definition" jsonb NOT NULL,
      "payload"    jsonb NOT NULL DEFAULT '[]'::jsonb,
      "version"    text DEFAULT '1',
      "created_at" timestamptz DEFAULT now(),
      "updated_at" timestamptz DEFAULT now()
    )`);
    await run(`CREATE INDEX IF NOT EXISTS "idx_recipes_user" ON "recipes"("user_id")`);
  }

  // 2. 建 launch_templates 表
  if (!beforeLaunch) {
    console.log("→ creating launch_templates");
    await run(`CREATE TABLE IF NOT EXISTS "launch_templates" (
      "id"         text PRIMARY KEY,
      "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "name"       text NOT NULL,
      "definition" jsonb NOT NULL,
      "payload"    jsonb NOT NULL DEFAULT '[]'::jsonb,
      "version"    text DEFAULT '1',
      "origin_recipe_id" text,
      "origin_kind"       text NOT NULL DEFAULT 'upload',
      "created_at" timestamptz DEFAULT now(),
      "updated_at" timestamptz DEFAULT now()
    )`);
    await run(`CREATE INDEX IF NOT EXISTS "idx_launch_templates_user" ON "launch_templates"("user_id")`);
  }

  // 3. 数据迁移（从 templates）
  if (oldTemplatesCount > 0) {
    console.log(`→ migrating ${oldTemplatesCount} rows from templates`);
    await run(`
      DO $$
      DECLARE
        r record;
        has_params boolean;
        origin text;
      BEGIN
        FOR r IN SELECT * FROM "templates" LOOP
          has_params := jsonb_typeof(r.definition->'params') = 'array'
                        AND jsonb_array_length((r.definition->'params')::jsonb) > 0;
          IF has_params THEN
            INSERT INTO "recipes" (id, user_id, name, definition, payload, version, created_at, updated_at)
            VALUES (r.id, r.user_id, r.name, r.definition, r.payload, r.version, r.created_at, r.updated_at)
            ON CONFLICT (id) DO NOTHING;
          ELSE
            INSERT INTO "launch_templates" (
              id, user_id, name, definition, payload, version,
              origin_recipe_id, origin_kind,
              created_at, updated_at
            )
            VALUES (
              r.id, r.user_id, r.name, r.definition, r.payload, r.version,
              NULL, 'migration',
              r.created_at, r.updated_at
            )
            ON CONFLICT (id) DO NOTHING;
          END IF;
        END LOOP;
      END$$;
    `);
  }

  // 4. 落 migrations 表（兼容完整 runner 的追踪表）
  await run(`CREATE TABLE IF NOT EXISTS "_app_migrations" ("id" integer PRIMARY KEY, "filename" text NOT NULL, "applied_at" timestamptz DEFAULT now())`);
  await run(`INSERT INTO "_app_migrations" ("id", "filename") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [19, "0019_split_templates_to_recipes_and_launch_templates"]);

  const afterRecipes = await rowCount("recipes");
  const afterLaunch = await rowCount("launch_templates");
  console.log(`[0019-only] after: recipes=${afterRecipes} launch_templates=${afterLaunch}`);
  console.log("[0019-only] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
