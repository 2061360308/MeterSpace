/**
 * 数据库迁移脚本（一次性 / CI 步骤）。
 *
 * 设计要点：
 *   1. **不依赖 `drizzle-kit`** —— 它需要 TTY，serverless / CI 一跑就废
 *   2. **走 `@neondatabase/serverless`** —— 项目现有的连接，与 `src/lib/db` 同源
 *   3. **单语句粒度** —— Neon HTTP client 不支持多语句 prepared statement，
 *      因此每个以 `;` 结尾的语句单独执行一次；`DO $$ ... $$;` 块特殊处理
 *   4. **幂等** —— 失败回落到 catch-all，把 `already exists` / `duplicate` 当成功
 *   5. **追踪** —— 自维护 `_app_migrations`（id= 主键），记录到 idx 粒度
 *
 * 用法：
 *   本地：DATABASE_URL=... npx tsx scripts/db-migrate.ts
 *   CI  ：同上，DATABASE_URL 来自 CI secret
 *   只跑某一条：npx tsx scripts/db-migrate.ts --only=20
 *   从此往后：npx tsx scripts/db-migrate.ts --from=20
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL 未设置；请在 .env 或环境变量里提供");
  process.exit(1);
}

const sql = neon(databaseUrl);

// Neon 0.10+ 必须用 `sql.query(text, params, options)` 这种形式；
// 已不暴露无 tagged template 的可变参调用 —— 这里把动态 SQL 全部走 .query(...)。
async function runSql(text: string, params: unknown[] = []): Promise<unknown[]> {
  // 加分号兼容 postgres 直挂式（HTTP client 会自动处理）
  return await sql.query(text.endsWith(";") ? text : text + ";", params);
}

async function runScalar<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = (await runSql(text, params)) as T[];
  return rows;
}

// ---------------------------------------------------------------------------
//  SQL 拆分
// ---------------------------------------------------------------------------

/**
 * 简单 SQL 词法解析：足够应付本项目 drizzle 迁移。
 *   - 跳过单行注释、多行注释
 *   - 保留字符串字面量、单引号内的转义、双引号标识符
 *   - 识别 `DO $$ ... $$;` 块——块内部所有 `;` 不拆分
 *   - 在块外按 `;` 拆分
 */
function splitStatements(raw: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let i = 0;
  const n = raw.length;

  while (i < n) {
    if (raw[i] === "/" && raw[i + 1] === "*") {
      const end = raw.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      buf += " ";
      continue;
    }
    if (raw[i] === "-" && raw[i + 1] === "-") {
      const eol = raw.indexOf("\n", i);
      i = eol === -1 ? n : eol;
      continue;
    }
    if (raw[i] === "'") {
      const start = i;
      i++;
      while (i < n && raw[i] !== "'") {
        if (raw[i] === "'" && raw[i + 1] === "'") {
          i += 2;
          continue;
        }
        i++;
      }
      i++;
      buf += raw.slice(start, i);
      continue;
    }
    if (raw[i] === '"') {
      const start = i;
      i++;
      while (i < n && raw[i] !== '"') i++;
      i++;
      buf += raw.slice(start, i);
      continue;
    }
    if (raw[i] === "$" && raw[i + 1] === "$") {
      const start = i;
      const close = raw.indexOf("$$", i + 2);
      if (close === -1) {
        buf += raw.slice(start);
        i = n;
        continue;
      }
      buf += raw.slice(start, close + 2);
      i = close + 2;
      continue;
    }
    if (raw[i] === ";") {
      const trimmed = buf.trim();
      if (trimmed) stmts.push(trimmed);
      buf = "";
      i++;
      continue;
    }
    buf += raw[i];
    i++;
  }
  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

// ---------------------------------------------------------------------------
//  迁移执行
// ---------------------------------------------------------------------------

type MigrationFile = { id: number; filename: string; contents: string };

function loadMigrationFiles(): MigrationFile[] {
  const journalPath = resolve("drizzle/meta/_journal.json");
  const metaRaw = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  return metaRaw.entries
    .map((e) => ({
      id: e.idx,
      filename: e.tag,
      contents: readFileSync(resolve(`drizzle/${e.tag}.sql`), "utf8"),
    }))
    .sort((a, b) => a.id - b.id);
}

async function ensureMigrationsTable(): Promise<void> {
  await runSql(
    'CREATE TABLE IF NOT EXISTS "_app_migrations" ("id" integer PRIMARY KEY, "filename" text NOT NULL, "applied_at" timestamptz DEFAULT now())',
  );
}

async function getAppliedIds(): Promise<Set<number>> {
  try {
    const rows = await runScalar<{ id: number }>('SELECT "id" FROM "_app_migrations"');
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

function isIdempotentError(msg: string): boolean {
  return (
    msg.includes("already exists") ||
    msg.includes("does not exist") ||
    msg.includes("duplicate") ||
    msg.includes("IF NOT EXISTS")
  );
}

async function applyOne(m: MigrationFile): Promise<void> {
  const stmts = splitStatements(m.contents).filter((s) => {
    const cleaned = s.replace(/--> statement-breakpoint/g, "").trim();
    return cleaned.length > 0 && cleaned !== "statement-breakpoint";
  });

  console.log(
    `→ applying ${m.filename} (id=${m.id}) — ${stmts.length} statement(s)`,
  );
  let ok = 0;
  let skipped = 0;
  for (let i = 0; i < stmts.length; i++) {
    try {
      await runSql(stmts[i]);
      ok++;
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (isIdempotentError(msg)) {
        skipped++;
        continue;
      }
      throw new Error(
        `[db-migrate] ${m.filename} stmt ${i + 1}/${stmts.length} 失败：\n${msg}\n--- statement ---\n${stmts[i]}`,
      );
    }
  }
  console.log(
    `  ✓ ${m.filename}: ${ok} ok, ${skipped} skipped (idempotent)`,
  );
  await runSql(
    'INSERT INTO "_app_migrations" ("id", "filename") VALUES ($1, $2)',
    [m.id, m.filename],
  );
}

/**
 * 命令行过滤：
 *   --only=<idx>  只跑指定 idx（用于绕开历史上有问题的中间迁移）
 *   --from=<idx>  只跑 idx >= 指定值
 *
 * 例：`npm run db:migrate -- --only=20`
 */
function parseIdxFilter(): { only: number | null; from: number | null } {
  const args = process.argv.slice(2);
  const read = (prefix: string): number | null => {
    const hit = args.find((a) => a.startsWith(prefix));
    if (!hit) return null;
    const v = Number(hit.slice(prefix.length));
    return Number.isFinite(v) ? v : null;
  };
  return { only: read("--only="), from: read("--from=") };
}

async function main(): Promise<void> {
  console.log("[db-migrate] starting");
  await ensureMigrationsTable();
  const applied = await getAppliedIds();
  const all = loadMigrationFiles();
  let pending = all.filter((m) => !applied.has(m.id));

  const { only, from } = parseIdxFilter();
  if (only !== null) {
    console.log(`[db-migrate] --only=${only}：只应用该 idx`);
    pending = pending.filter((m) => m.id === only);
  } else if (from !== null) {
    console.log(`[db-migrate] --from=${from}：只应用 idx >= ${from}`);
    pending = pending.filter((m) => m.id >= from);
  }
  if (pending.length === 0) {
    console.log("[db-migrate] nothing to apply — DB already up to date");
    return;
  }
  console.log(
    `[db-migrate] ${pending.length} pending: ${pending
      .map((m) => m.filename)
      .join(", ")}`,
  );
  for (const m of pending) await applyOne(m);
  console.log("[db-migrate] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
