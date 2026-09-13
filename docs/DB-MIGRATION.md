# 数据库迁移运维手册

> 适用：MeterSpace / Neon Postgres / Vercel serverless
> 建立：2026-09-12（v3 模板体系拆表时，因「新代码上线但 DB 没迁移」事故而补）
> **更新：2026-09-13 —— 22 个历史迁移已合并为单一 `0000_baseline.sql`，账本重置（见 §5）**

---

## 0. 为什么需要这份文档

Vercel 免费版 **没有 Cron、没有常驻进程**，也没有自动迁移钩子。Drizzle 只负责**生成** SQL，
**不负责执行**。所以：

- 写了 `drizzle/00XX_xxx.sql` ≠ 迁移已应用
- 新代码引用新表**必须**先人工跑一次迁移，否则线上直接 `Failed query`

另外 `drizzle-kit`（`generate` / `push` / `migrate`）**需要 TTY**，CI / serverless 一跑就废。
本项目的解法是两个**不依赖 TTY** 的 Node 脚本。

---

## 1. 两个脚本

| 命令 | 文件 | 用途 |
| --- | --- | --- |
| `npm run db:migrate` | `scripts/db-migrate.ts` | **通用版**。读 `drizzle/meta/_journal.json` 的 idx 列表，按序跑所有未应用的迁移 |
| `npm run db:migrate -- --only=<idx>` | `scripts/db-migrate.ts` | **单条版**。只应用指定 idx |
| `npm run db:migrate -- --from=<idx>` | `scripts/db-migrate.ts` | 只应用 idx ≥ 指定值的迁移 |
| `npm run db:verify` | `scripts/db-verify.ts` | **验证**。打印两表结构 + 行数 + 数据预览 + settings 关键列类型 + `instances.use_spot` |

> `db:migrate:0019`（`scripts/db-migrate-0019-only.ts`）已于 2026-09-13 **删除**：
> 它服务于一次性拆表，目标 SQL 已归档；且它硬编码写入 `_app_migrations` 的 `id=19`，
> 在账本重置后继续跑会插入一条无对应文件的脏记录。
>
> `db:dump:my-resources`（`scripts/db-dump-my-resources.ts`）同样已于 2026-09-13 **删除**：
> 它导出的 `user_images` / `user_features` / `user_scripts` 三张表已 DROP，脚本已无输出。

这些脚本的共同特点：
- 走 `@neondatabase/serverless`（与 `src/lib/db` 同源，不额外装驱动）
- 通过 `dotenv` 读 `.env` 的 `DATABASE_URL`
- **幂等** —— `already exists` / `does not exist` / `duplicate` 一律当成功跳过
- 用 `tsx` 加载器运行 TypeScript，无需预编译

### 运行

```bash
# 本地（读 .env）
npm run db:migrate

# 指定 URL（CI / 临时）
DATABASE_URL=postgresql://... npx tsx scripts/db-migrate.ts
```

---

## 2. 追踪表 `_app_migrations`

本项目**自维护**一张轻量追踪表，而**不用** drizzle 自带的 `__drizzle_migrations`：

```sql
CREATE TABLE IF NOT EXISTS "_app_migrations" (
  "id"         integer PRIMARY KEY,   -- = drizzle/meta/_journal.json 里的 idx
  "filename"   text NOT NULL,
  "applied_at" timestamptz DEFAULT now()
);
```

理由：`__drizzle_migrations` 只在 `drizzle-kit` 路径下写，而我们的脚本不经过 drizzle-kit。

> ⚠️ **两套账不要混用。** 一旦用了 `_app_migrations`，就别再跑 `drizzle-kit migrate`，
> 否则同一个 idx 会被两套系统各记一次、状态对不上。
>
> **2026-09-13**：`DROP SCHEMA "drizzle" CASCADE` **已执行** —— `__drizzle_migrations`
> 及其 19 行陈旧记录已删除，**两套账的陷阱彻底消除**（库内非默认 schema 现为 0 个）。
> 删除前快照见 `.backup/baseline-switch-2026-09-13/ledger-drizzle-native.json`。
>
> ⚠️ **今后不要再引入 drizzle-kit 的迁移路径**。本项目只有 `_app_migrations` 一套账。

### 2026-09-13 账本重置

原账本**只登记了 6 条**（idx 0,1,2,19,20,21），但 idx 3–18 实际**早已应用**
（历史走过 `drizzle-kit push`，不走 SQL 文件，因此没有记账）。
后果是 `npm run db:migrate` 会试图重放这 16 条历史迁移。

已重置为**单条记录**：

| id | filename | 说明 |
| --- | --- | --- |
| 0 | `0000_baseline` | 对应 `drizzle/0000_baseline.sql`，即当前线上完整结构 |

---

## 3. Neon HTTP client 的两个坑（脚本已绕过）

### 坑 1：强制 tagged template

```ts
const sql = neon(url);

await sql("SELECT * FROM t");              // ❌ 报错
await sql`SELECT * FROM t`;                // ✅ tagged template
await sql.query("SELECT * FROM t WHERE id = $1", [id]);  // ✅ 动态 SQL 用这个
```

报错原文：
> This function can now be called only as a tagged-template function: sql`SELECT ${value}`, not sql("SELECT $1", [value], options).

### 坑 2：不支持多语句 prepared statement

```ts
await sql.query("CREATE TABLE a (...); CREATE TABLE b (...);", []);
// ❌ cannot insert multiple commands into a prepared statement
```

**解法**：单语句粒度。`scripts/db-migrate.ts` 里写了一个简易 lexer：

- 跳过单行 `--` / 多行 `/* */` 注释
- 保留单引号字符串（含 `''` 转义）、双引号标识符
- `DO $$ ... $$;` 块内部的 `;` **不拆分**（否则 PL/pgSQL 会被撕裂）
- 块外按 `;` 拆分，逐条 `sql.query(...)`

新增迁移文件时，只要保证「语句以 `;` 结尾」就能被正确拆分。

---

## 4. 标准流程：新增一次迁移

1. **手写 SQL** → `drizzle/000N_<name>.sql`（`drizzle-kit generate` 要 TTY，非交互环境跑不了）
   - 语句之间用 `--> statement-breakpoint` 分隔（drizzle 约定，可选但推荐）
   - ⚠️ **`0000_baseline.sql` 是基线，永远不要再改它**。新变更一律从 `0001_` 起新开文件
2. **登记 journal** → 在 `drizzle/meta/_journal.json` 的 `entries` 数组末尾追加：
   ```json
   { "idx": 1, "version": "7", "when": <毫秒时间戳>, "tag": "0001_<name>", "breakpoints": true }
   ```
   `idx` 必须递增且唯一。**基线占用 idx 0，故新迁移从 1 开始。**
3. **同步 Drizzle schema** → 改 `src/lib/db/schema.ts`，让 TS 类型跟上
4. **本地验证** → `npx tsc --noEmit`
5. **跑迁移** → `npm run db:migrate`
6. **验证** → `npm run db:verify`（或自定义查询）
7. **再部署** → 确认 DB 就绪后推代码

> 顺序很重要：**先迁 DB，再发代码**。反过来就是这次事故的成因。

---

## 5. 当前状态（2026-09-13 起）

### 迁移文件

**只有 1 个**：`drizzle/0000_baseline.sql`（21 表 / 76 条语句）。

0000–0021 的历史原件已归档至 `.workbuddy/drizzle-archive-2026-09-13/`
（22 个 `.sql` + 旧 `_journal.json` + 旧 `0000_snapshot.json`）。

### 账本

| id | filename | 说明 |
| --- | --- | --- |
| 0 | `0000_baseline` | 与 `drizzle/0000_baseline.sql` 对应 |

`npm run db:migrate` 现在的正确输出是：

```
[db-migrate] nothing to apply — DB already up to date
```

### baseline 是怎么来的（重要）

`0000_baseline.sql` **不是**把 0000–0021 拼接起来生成的，而是**从线上库反向导出**的
（`pg_catalog` 的 `format_type` / `pg_get_constraintdef` / `pg_get_indexdef`）。

原因：0001–0012 的 schema 是历史 `drizzle-kit push` 落的，来源是 `src/lib/db/schema.ts`
而不是那些 SQL 文件，两者不保证一致——直接拼接会产出与线上不符的基线。

生成与验证脚本（一次性工具，**未**纳入 `scripts/`）：
`.workbuddy/baseline-tools/{gen-baseline,verify}.cjs`

**验证方式**：把 baseline 导入同库的临时 schema `_baseline_check`（靠 `sql.transaction`
内的 `SET LOCAL search_path` 实现——Neon HTTP 驱动无状态，`SET` 必须与语句同事务），
再与 `public` 逐表 diff：列名/类型/NOT NULL/默认值、约束名/类型/定义、索引名/定义。

结果：**21 表全部 ✓，0 差异**；验证后临时 schema 已删除。

### 表结构现状（2026-09-13 清理后）

| 项 | 数量 |
| --- | --- |
| `schema.ts` 定义的表 | 21 |
| 线上实有表 | 22 |
| 差值 | 1 = `_app_migrations`（迁移账本，由 `db-migrate.ts` 自建，**不属于** `schema.ts`） |

**线上已与 baseline 完全对齐** —— 对 21 张表跑验证的结果为 **0 差异**。

### 已 DROP 的 4 张孤儿表（2026-09-13）

原为已删功能遗留：`schema.ts` 已无定义、`src/` 代码层零引用。**先导出数据再删除**：

| 表 | 删前行数 | 来源 |
| --- | --- | --- |
| `templates` | 1 | v3 拆表后本应 DROP，当时的一次性应急脚本只建表+迁数据、**漏了 DROP** |
| `user_features` | 2 | 已删的「我的资源」功能 |
| `user_images` | 1 | 同上 |
| `user_scripts` | 0 | 同上 |

数据留档：`.backup/baseline-switch-2026-09-13/orphan-tables.json`

删除脚本 `.workbuddy/baseline-tools/drop-orphans.cjs` 自带两道保险：
① 删除前逐表比对「线上行数 == 备份条数」，不一致就中止；
② 删除后校验表清单与 21 张存活表行数未漂移。

### 历史遗留问题（已消解）

原文记录的「`db:migrate` 会卡在 0003 的 `cloud_instance_id NOT NULL`」**已不再适用**：
baseline 是单一文件、描述的正是线上现状，不存在需要重放的历史 ALTER。

---

## 6. 待办 / 注意事项

| # | 事项 | 建议 |
| --- | --- | --- |
| 6.1 | ✅ **已完成（2026-09-13）**：4 张孤儿表已 DROP | `templates` / `user_features` / `user_images` / `user_scripts` 均已删除，数据留档 `.backup/baseline-switch-2026-09-13/orphan-tables.json`。线上表数 26 → 22，与 baseline 对齐 |
| 6.2 | 账本口径已重置 | idx 从 0 重新计数；新迁移从 **idx=1** 开始（见 §4）。旧 idx 19/20/21 已不再对应任何文件 |
| 6.3 | ✅ **已完成（2026-09-13）**：`DROP SCHEMA "drizzle" CASCADE` | 陈旧的 `drizzle.__drizzle_migrations`（19 行）已随 schema 一起删除，**两套账的陷阱已彻底消除**。库内非默认 schema 现为 0 个。快照见 `.backup/baseline-switch-2026-09-13/ledger-drizzle-native.json` |
| 6.4 | 迁移无自动化钩子 | 每次部署前**人工**跑一次 `npm run db:migrate`，或在 CI 的 build 步骤插入 |
| 6.5 | `0000_baseline.sql` 是**只读基线，永不修改** | 新变更一律新增 `0001_xxx.sql`。若日后需要再次「重开基线」，生成/验证工具在 `.workbuddy/baseline-tools/`（`gen-baseline.cjs` → `verify.cjs`），流程与本次相同：备份 → 导出 → 临时 schema 验证 0 diff → 重置 journal 与账本 |
| 6.6 | `settings` 表的 `default_region` / `default_spec` / `default_disk_category` / `default_spot_strategy` 四列**已从代码层移除但 DB 未 DROP** | 四列都有 DEFAULT 值（见 `drizzle/0000_baseline.sql` 的 `settings` 定义），删了 schema 定义也不影响 INSERT。确认无碍后可清：

```sql
ALTER TABLE "settings"
  DROP COLUMN IF EXISTS "default_region",
  DROP COLUMN IF EXISTS "default_spec",
  DROP COLUMN IF EXISTS "default_disk_category",
  DROP COLUMN IF EXISTS "default_spot_strategy";
```

⚠️ `default_spot_duration` **不要用**——它已恢复使用（见 6.8） |
| 6.7 | `settings.default_release_hours` 是 `real`（由 `0005_add_missing_settings_columns.sql` 从 integer 改来），默认值 `0.5` | **不要再改回 integer**，否则 0.5 小时会被截断。`workspaces.release_hours` 仍是 `integer`，只能填整数小时——这是有意的（工作区级覆盖走整数，全局默认允许半小时粒度） |
| 6.8 | ⚠️ **先迁 DB 再发代码** | 新环境/新库：先 `npm run db:migrate`（一把建出 baseline 全结构），确认 `nothing to apply` 或 `done`，再发代码。反过来就是 2026-09-12 那次事故的成因 |
| 6.9 | `region_resources` 有 6 小时 TTL（`REGION_RESOURCE_TTL_MS`） | 超期会重新探测基础资源。用户在云控制台手删 VPC/VSwitch/安全组后，RunInstances 会报错并触发 `invalidateRegionResources()` 主动作废，下一次自动重建 |

---

## 7. 数据留档

删除功能/表之前导出的数据统一放 `.backup/`：

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `.backup/my-resources-<时间戳>.json` | `user_images`(1 行) / `user_features`(2 行) / `user_scripts`(0 行) | 一次性脚本（`db:dump:my-resources`，已于 2026-09-13 删除） |
| `.backup/baseline-switch-2026-09-13/orphan-tables.json` | 4 张孤儿表全量数据（含 `templates` 1 行） | 一次性工具 |
| `.backup/baseline-switch-2026-09-13/ledger-app-migrations.json` | 重置前的 `_app_migrations`（6 行） | 同上 |
| `.backup/baseline-switch-2026-09-13/ledger-drizzle-native.json` | 重置前的 `drizzle.__drizzle_migrations`（19 行） | 同上 |
| `.backup/baseline-switch-2026-09-13/rowcounts-before.json` | 切换前 26 张表行数快照 | 同上 |

> ✅ 上述留档均为**历史一次性导出**，对应的导出脚本（若曾有）已随用途结束而删除，
> 不要再尝试重新执行。4 张孤儿表已于 2026-09-13 DROP。

`.workbuddy/drizzle-archive-2026-09-13/` 存放合并前的 22 个历史迁移 `.sql` +
旧 `_journal.json` + 旧 `0000_snapshot.json`（供追溯，非运行时依赖）。

`_meta` 字段记录了导出时间和原因，便于日后追溯。

---

## 8. 相关文档

| 主题 | 位置 |
| --- | --- |
| v3 模板体系拆表（决策 + 架构 + 遗留事项） | `docs/TEMPLATE-EDITOR.md` |
| 数据模型 | `docs/FINAL-PLAN.md` §9 |
| 系统硬约束（serverless / 无 Cron） | `docs/FINAL-PLAN.md` §1 |
