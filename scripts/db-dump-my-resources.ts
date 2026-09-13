/**
 * 导出 `user_images` / `user_features` / `user_scripts` 三张表的数据留档。
 *
 * 背景：这三个「我的资源」页面是孤儿——用户能 CRUD，但创建工作区的流程
 * （wizard）已完全不读取这些数据。删除前先把数据 dump 出来留档，
 * 万一以后反悔能恢复。
 *
 * 用法：
 *   npm run db:dump:my-resources
 *   DATABASE_URL=... npx tsx scripts/db-dump-my-resources.ts
 *
 * 输出：`.backup/my-resources-<ISO 时间戳>.json`
 */
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 未设置");
  process.exit(1);
}
const sql = neon(url);

/** 要导出表名（顺序即输出顺序）。 */
const TABLES = ["user_images", "user_features", "user_scripts"] as const;

async function tableExists(name: string): Promise<boolean> {
  const rows = (await sql.query(
    "SELECT 1 AS x FROM information_schema.tables WHERE table_name = $1 LIMIT 1",
    [name],
  )) as Array<{ x: number }>;
  return rows.length > 0;
}

async function main(): Promise<void> {
  const dump: Record<string, unknown[]> = {};
  const summary: string[] = [];

  for (const t of TABLES) {
    if (!(await tableExists(t))) {
      console.log(`· ${t} 不存在，跳过`);
      dump[t] = [];
      summary.push(`${t}: (table missing)`);
      continue;
    }
    const rows = (await sql.query(`SELECT * FROM "${t}"`, [])) as unknown[];
    dump[t] = rows;
    console.log(`✓ ${t}: ${rows.length} 行`);
    summary.push(`${t}: ${rows.length} 行`);
  }

  const outDir = resolve(".backup");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = resolve(outDir, `my-resources-${stamp}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        _meta: {
          exportedAt: new Date().toISOString(),
          reason:
            "删除孤儿功能「我的镜像/开发环境/脚本」前的数据留档。这三张表的数据未被任何业务流程读取（wizard 已不引用），仅作存档。",
          summary,
        },
        ...dump,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n已导出 → ${outFile}`);
  console.log(summary.map((s) => `  · ${s}`).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
