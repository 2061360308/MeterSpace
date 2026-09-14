/**
 * 验证 recipes + launch_templates 表结构与现有数据
 */
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: ".env" });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = neon(url);

async function main() {
  console.log("=== recipes 表结构 ===");
  const r1 = (await sql.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'recipes'
     ORDER BY ordinal_position`,
    [],
  )) as unknown[];
  for (const r of r1) console.log("  ", r);

  console.log("\n=== launch_templates 表结构 ===");
  const r2 = (await sql.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'launch_templates'
     ORDER BY ordinal_position`,
    [],
  )) as unknown[];
  for (const r of r2) console.log("  ", r);

  console.log("\n=== recipes 行数 ===");
  console.log(
    "  ",
    await sql.query("SELECT COUNT(*)::int AS n FROM recipes", []),
  );

  console.log("\n=== launch_templates 行数 ===");
  console.log(
    "  ",
    await sql.query("SELECT COUNT(*)::int AS n FROM launch_templates", []),
  );

  console.log("\n=== launch_templates 数据预览 ===");
  const sample = (await sql.query(
    `SELECT id, name, origin_kind, jsonb_array_length(definition->'params') AS params_len
     FROM launch_templates
     LIMIT 5`,
    [],
  )) as unknown[];
  for (const r of sample) console.log("  ", r);

  console.log("\n=== settings 关键列类型（default_auto_renewal_minutes 应为 integer，默认 35）===");
  const cols = (await sql.query(
    `SELECT column_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_name = 'settings'
       AND column_name IN (
         'default_auto_renewal_minutes', 'default_idle_minutes',
         'default_spot_duration',
         'default_region', 'default_spec', 'default_disk_category'
       )
     ORDER BY ordinal_position`,
    [],
  )) as unknown[];
  for (const c of cols) console.log("  ", c);

  console.log("\n=== region_resources（0021）===");
  const rr = (await sql.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'region_resources'
     ORDER BY ordinal_position`,
    [],
  )) as unknown[];
  if (rr.length === 0) {
    console.log("   ❌ 表不存在——请先跑 npm run db:migrate -- --only=21");
  } else {
    console.log("   列：", rr.map((c) => (c as { column_name: string }).column_name).join(", "));
    console.log("   行数：", await sql.query("SELECT COUNT(*)::int AS n FROM region_resources", []));
  }

  console.log("\n=== instances.use_spot（0020）===");
  const useSpot = (await sql.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'instances' AND column_name = 'use_spot'`,
    [],
  )) as unknown[];
  console.log("  ", useSpot.length ? useSpot[0] : "❌ 列不存在——请先跑 npm run db:migrate -- --only=20");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
