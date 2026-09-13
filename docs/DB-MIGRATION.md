# 数据库迁移运维手册

> 适用：MeterSpace / Neon Postgres / Vercel serverless
> 建立：2026-09-12（v3 模板体系拆表时，因「新代码上线但 DB 没迁移」事故而补）

---

## 0. 为什么需要这份文档

Vercel 免费版 **没有 Cron、没有常驻进程**，也没有自动迁移钩子。Drizzle 只负责**生成** SQL，
**不负责执行**。所以：

- 写了 `drizzle/00XX_xxx.sql` ≠ 迁移已应用
- 新代码引用新表**必须**先人工跑一次迁移，否则线上直接 `Failed query`

另外 `drizzle-kit`（`generate` / `push` / `migrate`）**需要 TTY**，CI / serverless 一跑就废。
本项目的解法是三个**不依赖 TTY** 的 Node 脚本。

---

## 1. 三个脚本

| 命令 | 文件 | 用途 |
| --- | --- | --- |
| `npm run db:migrate` | `scripts/db-migrate.ts` | **通用版**。读 `drizzle/meta/_journal.json` 的 idx 列表，按序跑所有未应用的迁移 |
| `npm run db:migrate:0019` | `scripts/db-migrate-0019-only.ts` | **应急版**。只跑当前这次拆表（建 `recipes` + `launch_templates` + 迁数据），绕开中间失败的 ALTER |
| `npm run db:migrate -- --only=<idx>` | `scripts/db-migrate.ts` | **单条版**。只应用指定 idx（推荐替代上面的应急脚本，以后不用再写 one-off 脚本） |
| `npm run db:migrate -- --from=<idx>` | `scripts/db-migrate.ts` | 只应用 idx ≥ 指定值的迁移 |
| `npm run db:verify` | `scripts/db-verify.ts` | **验证**。打印两表结构 + 行数 + 数据预览 + settings 关键列类型 + `instances.use_spot` |

三者的共同特点：
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

1. **手写 SQL** → `drizzle/00XX_<name>.sql`（`drizzle-kit generate` 要 TTY，非交互环境跑不了）
   - 语句之间用 `--> statement-breakpoint` 分隔（drizzle 约定，可选但推荐）
2. **登记 journal** → 在 `drizzle/meta/_journal.json` 的 `entries` 数组末尾追加：
   ```json
   { "idx": 20, "version": "7", "when": <毫秒时间戳>, "tag": "00XX_<name>", "breakpoints": true }
   ```
   `idx` 必须递增且唯一。
3. **同步 Drizzle schema** → 改 `src/lib/db/schema.ts`，让 TS 类型跟上
4. **本地验证** → `npx tsc --noEmit`
5. **跑迁移** → `npm run db:migrate`
6. **验证** → `npm run db:verify`（或自定义查询）
7. **再部署** → 确认 DB 就绪后推代码

> 顺序很重要：**先迁 DB，再发代码**。反过来就是这次事故的成因。

---

## 5. 当前状态（2026-09-12）

| 表 | 状态 | 行数 | 备注 |
| --- | --- | --- | --- |
| `recipes` | ✅ 已建 | 0 | 8 列 |
| `launch_templates` | ✅ 已建 | 1 | 10 列；数据来自旧 `templates`，`origin_kind='migration'` |
| `templates` | ⚠️ **未 DROP** | 1 | 有意保留作兜底，见下 |
| `_app_migrations` | ✅ 已建 | 1（id=19） | |

### 已知会卡的地方

`npm run db:migrate` 在这台库上**会卡在 0003**：

```
ALTER TABLE "workspaces" ADD COLUMN "cloud_instance_id" uuid NOT NULL REFERENCES "cloud_instances"("id")
→ column "cloud_instance_id" of relation "workspaces" contains null values
```

原因：`workspaces` 已有数据，`NOT NULL` 无默认值无法直接加。

**补迁移需要单独写**（三段式）：

```sql
ALTER TABLE "workspaces" ADD COLUMN "cloud_instance_id" uuid;      -- 1) 先可空
UPDATE "workspaces" SET "cloud_instance_id" = ... WHERE ...;        -- 2) backfill
ALTER TABLE "workspaces" ALTER COLUMN "cloud_instance_id" SET NOT NULL;  -- 3) 再加约束
```

在这之前，**不要用通用版跑全量迁移**——用 `npm run db:migrate -- --only=<idx>` 指定单条。

### 已应用的迁移

| idx | 内容 | 备注 |
| --- | --- | --- |
| 19 | 拆表 `recipes` + `launch_templates` | 用 `db:migrate:0019` 应急版跑的 |
| 20 | `instances.use_spot boolean NOT NULL DEFAULT false` | 抢占选择落库；用 `--only=20` 跑的 |
| 21 | 新建 `region_resources` 表（VPC/VSwitch/镜像/共享安全组落库） | 用 `--only=21` 跑的；**先跑它再发代码**，否则建实例时查表报错 |

---

## 6. 待办 / 注意事项

| # | 事项 | 建议 |
| --- | --- | --- |
| 6.1 | 旧 `templates` 表未 DROP | 新表稳定后手动清：`DROP TABLE "templates" CASCADE;`。**清之前先核对 `launch_templates` 里那 1 行** |
| 6.2 | 0003–0018 在这台库上部分未应用 | 需单独补迁移（见 §5），不要直接跑通用版 |
| 6.3 | `_app_migrations` 与 drizzle 原生追踪表不共存 | 二选一，别混用 |
| 6.4 | 迁移无自动化钩子 | 每次部署前**人工**跑一次 `npm run db:migrate`，或在 CI 的 build 步骤插入 |
| 6.5 | `user_images` / `user_features` / `user_scripts` 三张表已无代码读写 | 对应功能「我的镜像 / 开发环境 / 脚本」是孤儿（wizard 不读这些数据），**代码层已全删**。数据留档在 `.backup/my-resources-*.json`。表保留未 DROP，确认无碍后可清：

```sql
DROP TABLE IF EXISTS "user_scripts" CASCADE;
``` |
| 6.6 | `settings` 表的 `default_region` / `default_spec` / `default_disk_category` / `default_spot_strategy` 四列**已从代码层移除但 DB 未 DROP** | 四列都有 DEFAULT 值（`0000_overjoyed_stellaris.sql`），删了 schema 定义也不影响 INSERT。确认无碍后可清：

```sql
ALTER TABLE "settings"
  DROP COLUMN IF EXISTS "default_region",
  DROP COLUMN IF EXISTS "default_spec",
  DROP COLUMN IF EXISTS "default_disk_category",
  DROP COLUMN IF EXISTS "default_spot_strategy";
```

⚠️ `default_spot_duration` **不要用**——它已恢复使用（见 6.8） |
| 6.7 | `settings.default_release_hours` 是 `real`（由 `0005_add_missing_settings_columns.sql` 从 integer 改来），默认值 `0.5` | **不要再改回 integer**，否则 0.5 小时会被截断。`workspaces.release_hours` 仍是 `integer`，只能填整数小时——这是有意的（工作区级覆盖走整数，全局默认允许半小时粒度） |
| 6.8 | ⚠️ **先迁 DB 再发代码** | `instances.use_spot`（0020）与 `region_resources` 表（0021）缺一个都会让建实例直接报错。换环境部署：先 `npm run db:migrate -- --only=20` 和 `--only=21`，再发代码 |
| 6.9 | `region_resources` 有 6 小时 TTL（`REGION_RESOURCE_TTL_MS`） | 超期会重新探测基础资源。用户在云控制台手删 VPC/VSwitch/安全组后，RunInstances 会报错并触发 `invalidateRegionResources()` 主动作废，下一次自动重建 |

---

## 7. 数据留档

删除功能/表之前导出的数据统一放 `.backup/`：

| 文件 | 内容 | 导出命令 |
| --- | --- | --- |
| `.backup/my-resources-<时间戳>.json` | `user_images`(1 行) / `user_features`(2 行) / `user_scripts`(0 行) | `npm run db:dump:my-resources` |

`_meta` 字段记录了导出时间和原因，便于日后追溯。

---

## 8. 相关文档

| 主题 | 位置 |
| --- | --- |
| v3 模板体系拆表（决策 + 架构 + 遗留事项） | `docs/TEMPLATE-EDITOR.md` |
| 数据模型 | `docs/FINAL-PLAN.md` §9 |
| 系统硬约束（serverless / 无 Cron） | `docs/FINAL-PLAN.md` §1 |
