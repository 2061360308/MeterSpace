# 模板架构重构 v3（2026-09-12 重写）

> v1 → v2 的核心是「放弃 in-system 编辑」，但用户要求**全部走新路由**（不弹 Dialog），
> 并**彻底拆表**。v3 即按这两条实施。
>
> 上游：`docs/FINAL-PLAN.md` §9 / `docs/TEMPLATE-UI.md`（已与本规划不一致，回滚）

---

## 0. 决策记录（用户已拍板）

| # | 决策 |
| --- | --- |
| 1 | **拆成两张独立表**：`recipes` + `launch_templates`，互不引用（无 FK / 无 upstream 字段） |
| 2 | 现有 user 模板按 `params.length === 0 ? launch : recipe` 自动归类 |
| 3 | **使用配方 = 新路由** `/recipes/[id]/use`（不再用 Dialog） |
| 4 | **上传配方 = 新路由** `/recipes/upload`（上传 → 解析 → 浏览 → 确认） |
| 5 | **新建启动模板 = 新路由** `/launch-templates/new`：第 1 步在「上传 / 使用配方」二选一 |
| 6 | builtin / marketplace 配方**只读、不允许 UI 删除**（系统升级更新；用户用完可创建新副本） |

---

## 1. 架构总览（v3）

```
┌───────────────────┐         ┌────────────────────┐         ┌──────────────┐
│  Zip 上传（任意    │         │ POST /recipes/upload│         │  /recipes/   │
│  专业编辑器写）    │ ──────▶ │ 解析 → 预览对象     │ ──────▶ │   upload     │
└───────────────────┘         │ （客户端持有）       │         │ （浏览 → 确认）│
       │                      └────────────────────┘         └──────┬───────┘
       │                                                           │
       │ ZIP（不持占位符/无 params）                                │ POST /recipes { def, payload }
       │                                                           ▼
       │                                              ┌────────────────────────┐
       │                                              │  recipes 表             │
       │                                              │  source: user           │
       │                                              │  params: {...}          │
       │                                              │  payload: 含 {{key}} 占位│
       │                                              └────────────────────────┘
       │
       │                                                                      ┌────────────────────────┐
       │                                                                      │  recipes 表             │
       │                                              GET /recipes/[id]        │  builtin / marketplace  │
       │                                              ──────────────────────▶ │  （运行时常量 + JSON）  │
       │                                              POST /recipes/[id]/use   └────────────────────────┘
       │                                              { params }                          │
       │                                              │ 系统渲染 + 落库                        │
       │                                              ▼                                      │
       │                                  ┌────────────────────────┐                          │
       │                                  │  launch_templates 表    │                          │
       │                                  │  source: user           │                          │
       │                                  │  params: []             │                          │
       │                                  │  payload: 完全确定     │                          │
       │                                  └────────┬────────────────┘                          │
       │                                           │                                            │
       │  ZIP（无 params / 直接可运行） │         │ POST /launch-templates/[id]/instantiate   │
       │  POST /launch-templates/upload             ▼                                              │
       │  → 解析 → 预览 → POST /launch-templates ┌─────────────────┐                            │
       │  （/launch-templates/new/upload 单页    │   workspaces    │ ◀────────────────────────┘
       │  走完整流程）                            └─────────────────┘
       │
       ▼
┌────────────────────────┐
│  wizard 第 3 步        │
│  GET /launch-templates │
│  POST 上一步 instantiate│
└────────────────────────┘
```

**关键不变量**：
- `recipes.params` 可非空；`launch_templates.params` 永远为 `[]`
- `recipes.payload` 可含 `{{key}}`；`launch_templates.payload` 完全确定
- 两表**无任何关联**（无 FK、无 upstream_id）
- 用户上传「无 params 的 zip」→ 走 `/launch-templates/new/upload`（不是 `/recipes/upload`），系统拒绝把它当配方保存

---

## 2. 数据模型

### 2.1 新表（当时为 `drizzle/0019_split_templates_to_recipes_and_launch_templates.sql`）

> ⚠️ **2026-09-13 起文件位置已变**：22 个历史迁移（0000–0021）已合并为单一的
> `drizzle/0000_baseline.sql`，本文引用的 `0019_*.sql` 已归档至
> `.workbuddy/drizzle-archive-2026-09-13/`。下表定义现在是 baseline 的一部分，
> 权威版本见 `drizzle/0000_baseline.sql` 的 `recipes` / `launch_templates` 段落。
> 迁移账本口径见 `docs/DB-MIGRATION.md` §5。

```sql
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
CREATE INDEX IF NOT EXISTS "idx_recipes_user" ON "recipes"("user_id");

-- === 启动模板：无 params、payload 完全确定、永远 source=user ===
CREATE TABLE IF NOT EXISTS "launch_templates" (
  "id"         text PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "definition" jsonb NOT NULL,
  "payload"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version"    text DEFAULT '1',
  -- 由哪份 recipe 衍生（运营审计；删除 recipe 不影响 launch_templates 的存活）
  "origin_recipe_id" text,
  "origin_kind"       text,         -- 'recipe' | 'upload' | 'fork'
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_launch_templates_user" ON "launch_templates"("user_id");

-- === 数据迁移：templates → recipes / launch_templates ===
-- 现有数据按 params 是否为空自动归类：
--   params 长度 > 0   → recipes（保留原 source）
--   params 长度 === 0 → launch_templates（强制 source='user'）
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM "templates" LOOP
    IF jsonb_array_length((r.definition->'params')::jsonb) > 0 THEN
      INSERT INTO "recipes" (id, user_id, name, definition, payload, version, created_at, updated_at)
      VALUES (r.id, r.user_id, r.name, r.definition, r.payload, r.version, r.created_at, r.updated_at);
    ELSE
      INSERT INTO "launch_templates" (id, user_id, name, definition, payload, version, origin_recipe_id, origin_kind, created_at, updated_at)
      VALUES (
        r.id, r.user_id, r.name, r.definition, r.payload, r.version,
        NULL, 'migration',
        r.created_at, r.updated_at
      );
    END IF;
  END LOOP;
END$$;

DROP TABLE "templates";
```

### 2.2 Drizzle schema 改动

```ts
// 删 export const templates
export const recipes = pgTable("recipes", { /* 形状同 templates */ });
export const launchTemplates = pgTable("launch_templates", { /* 形状 + origin_recipe_id/origin_kind */ });
```

### 2.3 journal 登记

在 `drizzle/meta/_journal.json` 插入 idx 19（`when` 取 `Date.now()`）。

---

## 3. lib 拆分

| 模块 | 职责 |
| --- | --- |
| `src/lib/templates/types.ts` | 共享类型（Param/Template/PayloadFile/ActivityConfig） + entry kind 解析 |
| `src/lib/templates/validate.ts` | 共享校验（templateDefinitionSchema + parseTemplateDefinition + buildParamValues） |
| `src/lib/templates/render.ts` | 渲染（renderFile + jsonEscape） |
| `src/lib/templates/zip.ts` | zip 解包 / 打包 / 文件校验 |
| `src/lib/templates/builtin.ts` | 内置配方常量（被 recipes 服务 merge） |
| `src/lib/recipes/service.ts` | **新**：listRecipes / getRecipe / deleteRecipeRecipe |
| `src/lib/recipes/client.ts` | **新**：前端类型 + fetchRecipes / fetchRecipe / useRecipe / uploadRecipePreview / confirmRecipeUpload |
| `src/lib/launch-templates/service.ts` | **新**：listLaunchTemplates / getLaunchTemplate / deleteLaunchTemplate / instantiateWorkspaceFromLaunch |
| `src/lib/launch-templates/client.ts` | **新**：前端类型 + fetchLaunchTemplates / fetchLaunchTemplate / uploadLaunchTemplatePreview / confirmLaunchTemplateUpload |
| `src/lib/launch-templates/origin.ts` | 起 product：originRecipeId 推断（删除 recipe 时不级联；可选审计） |

---

## 4. API 拆分（v3 全清单）

### 4.1 配方 /api/recipes/*
| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /api/recipes | 合并列表（内置 + 市场 + user-owned） |
| POST | /api/recipes | 上传确认：接收 `{ definition, payload }` → 入 recipes 表（user） |
| GET | /api/recipes/[id] | 详情（含 payload 内容） |
| DELETE | /api/recipes/[id] | 仅 user-owned 可删（marketplace / builtin 拒） |
| GET | /api/recipes/[id]/download | 打包 zip 下载 |
| POST | /api/recipes/upload | multipart zip → 解析 + 校验 + 返回 **preview**（定义 + 文件清单摘要，不入库） |
| POST | /api/recipes/[id]/use | 输入 `params` → 渲染 + 创建 `launch_templates` 行 → 返回 launchTemplateId |

### 4.2 启动模板 /api/launch-templates/*
| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /api/launch-templates | 当前用户的 launch_templates 列表 |
| POST | /api/launch-templates | 上传确认：接收 `{ definition, payload }` → 入 launch_templates 表（强制 source=user, params=[]） |
| GET | /api/launch-templates/[id] | 详情 |
| DELETE | /api/launch-templates/[id] | 仅 user-owned 可删 |
| GET | /api/launch-templates/[id]/download | 打包 zip 下载 |
| POST | /api/launch-templates/upload | multipart zip → 校验 `payload` 无 `{{xxx}}` 占位符 + 返回 **preview**（不入库） |
| POST | /api/launch-templates/[id]/instantiate | 输入 name/region/git/proxy 等 → 创建 workspace |

### 4.3 删除（旧 /api/templates/* 全删）
- DELETE `/api/templates/[id]` （增量合并 endpoint）— 不再做
- POST `/api/templates/[id]/route.ts`
- POST `/api/templates/upload`
- GET `/api/templates/[id]/instantiate`（创建 workspace）

---

## 5. UI 流程

### 5.1 新路由 /recipes
```
/recipes                                   配方列表
/recipes/upload                            上传 zip → 解析 → 浏览 → 确认入库
/recipes/[id]                              详情（只读：基本信息 / params 列表 / 文件 CodeMirror 只读 / 端口 / 更多下拉「下载 zip」）
/recipes/[id]/use                          使用配方：填参数 → 预览 → 确认 → 创建 launch template → 跳 /launch-templates/[newId]
```

### 5.2 新路由 /launch-templates
```
/launch-templates                          模板列表
/launch-templates/new                      Step 1：上传 | 使用配方（两张卡）
/launch-templates/new/upload               （从 Step 1 的「上传」来）zip → 解析 → 浏览 → 确认 → 落库
/launch-templates/new/use                  （从 Step 1 的「使用配方」来）选 recipe → 填参数 → 确认 → 创建 launch
/launch-templates/[id]                     详情（只读：基本信息 / 文件 CodeMirror 只读 / 端口 / 更多下拉「下载 zip / 删除」）
```

**「使用配方」两路径归一**：
- `/launch-templates/new/use?recipe=<id>` 直接进填参
- 不带 query → 配方列表就地选

### 5.3 wizard 第 3 步
- 只列 launch_templates（已 source=user）
- 选中 → 「下一步」
- 提交 → POST `/api/launch-templates/[id]/instantiate`
- **`?launchTemplate=<id>` query 预选保留**

---

## 6. 推荐执行顺序（可编译的小步走）

| 顺序 | 改动 | tsc 状态 |
| --- | --- | --- |
| **A. 拆表 SQL + journal + Drizzle schema** | 0019 迁移 + 删旧 / 加新两表 + 删 export templates | 编译失败：所有 import templates 的地方需随 B 修 |
| **B. 重构 lib 层** | `lib/recipes/*` + `lib/launch-templates/*`；`lib/templates/` 只留 types/validate/render/zip/builtin；`service.ts` `client.ts` 切到新模块 | 编译通过 |
| **C. API 拆** | 新增 `/api/recipes/*` + `/api/launch-templates/*`；旧 `/api/templates/*` 标 deprecated 但保留兼容壳 | 编译通过 |
| **D. UI 拆** | 新 `/recipes` `/launch-templates` 完整流程（新详情页 / 上传页 / 使用页 / new page） | 编译通过 |
| **E. wizard 第 3 步** | `?launchTemplate=<id>` 替换 `?template=`；endpoint 替换 | 编译通过 |
| **F. 删旧** | `src/app/(protected)/templates/` 整目录；`(fullscreen)/templates/[id]/edit/` 整目录；`template-list.tsx` `template-page-actions.tsx` `launch-template-list.tsx` `directory-tree.tsx`；旧 `/api/templates/*` 端点；`lib/templates/client.ts` `service.ts`（保留 types/validate/render/zip/builtin）；侧栏菜单（资源管理下：配方 / 模板） | 编译通过 |
| **G. 校验** | tsc / eslint / build | 通过 |
| **H. 文档** | TEMPLATE-UI.md 同步；TEMPLATE-EDITOR.md 写「已落地」；MEMORY.md 更新 | — |

**合计约 5–6 人日**。

---

## 7. 引用

---

## 8. 遗留事项与注意事项（2026-09-12 实施后）

> ⚠️ 本节是**活清单**。v3 已落地并跑通，但下面这些点要么是有意保留、要么是已知缺口。
> 处理完一项就在此处划掉，避免口头约定丢失。

### 8.1 数据库 —— 有意保留

| # | 事项 | 现状 | 建议动作 |
| --- | --- | --- | --- |
| 8.1.1 | **旧 `templates` 表未 DROP** | 0019 的 `DROP TABLE "templates"` 未执行；表内还有 1 行老数据（`blank-mty3l428i9l`） | 新表稳定观察一段时间后手动清：`DROP TABLE "templates" CASCADE;`。**清之前先确认 `launch_templates` 里那 1 行数据无异常** |
| 8.1.2 | `_app_migrations` 是自维护表 | 与 drizzle 自带的 `__drizzle_migrations` **不同源** | 若以后改用 `drizzle-kit` 跑迁移，两套账会打架。要么统一到 `_app_migrations`（推荐，脚本已就绪），要么删掉它改回 drizzle 原生 |
| 8.1.3 | 旧库上 0003–0018 部分未应用 | 0003 的 `ALTER TABLE workspaces ADD COLUMN cloud_instance_id uuid NOT NULL` 因老数据有 NULL 而失败，后续迁移被阻塞 | 通用版 `npm run db:migrate` **会卡在 0003**。这个库的补迁移需要单独写「带默认值 + backfill + 加约束」的修补 SQL，不要直接跑通用版 |
| 8.1.4 | 0019 的 DO 块可重入 | 迁移用 `ON CONFLICT (id) DO NOTHING` 兜底 | 误重跑不会产生重复行，安全。但 `_app_migrations` 已记 id=19，通用版会直接跳过 |

### 8.2 代码 —— 有意保留 / 已下档

| # | 事项 | 说明 |
| --- | --- | --- |
| 8.2.1 | `lib/templates/service.ts` / `client.ts` 已下档为 `export {}` 占位 | **新代码禁止 import 这两个路径**。文件保留只为避免已编译产物里的路径断裂，找到时机可直接删文件 |
| 8.2.2 | Drizzle schema 已删 `templates` 导出，DB 里表还在 | **schema ≠ DB**。任何 `db.select().from(templates)` 都会编译失败——这是有意的，逼你用新表 |
| 8.2.3 | `workspaces.template_id` 指向旧 id 空间 | 新 `launch_templates.id` 是独立命名空间。老工作区仍指向 `templates` 里的 id，别做 JOIN |
| 8.2.4 | wizard 的 `state.templateParams` 保留但恒为 `{}` | launch_templates 无 params。字段留着只为兼容 wizard 状态结构，不要往里塞东西 |
| 8.2.5 | `origin_kind='migration'` 的行 | 从旧 `templates` 迁移过来的数据。**将来清理历史数据时以这个标记为筛选条件** |

### 8.3 功能缺口 —— 已知未实现

| # | 缺口 | 影响 | 优先级 |
| --- | --- | --- | --- |
| 8.3.1 | **配方上传没校验占位符与 params 的对应关系** | 代码里写了 `{{foo}}` 但 `params` 里没定义 `foo` → 使用时该占位符原样保留（不报错） | 中。v3 §4.1 提过要做，实现时漏了；建议补一条「上传后扫描 payload，未定义的 key 给出 warning」 |
| 8.3.2 | 启动模板上传的占位符检测是**阻断式** | 扫到 `{{key}}` 直接拦回，引导去配方上传。这符合设计，但如果用户确实要在启动脚本里写 shell 的 `${{...}}` 之类会被误判 | 低。真误判时提示很明确，用户可改语法绕过 |
| 8.3.3 | 上传预览**不落库、客户端持有** | 上传页刷新 = 前面白填，要重新选文件 | 低。两步流程里预览阶段不长，可接受 |
| 8.3.4 | 两个详情页（`/recipes/[id]`、`/launch-templates/[id]`）都是**只读** | 用户可能以为能编辑。文件区是只读 CodeMirror | 中。若后续反馈强烈，可加一条明确的提示条：「要修改请下载 zip → 在编辑器改 → 重新上传」 |
| 8.3.5 | 删除配方**不影响**由它派生的启动模板 | 设计如此（两表无关联）。但用户可能误以为删配方会连带删模板 | 低。必要时在删除确认框里说明 |

### 8.4 运维

| # | 事项 | 说明 |
| --- | --- | --- |
| 8.4.1 | Vercel 免费版**没有 Cron**，迁移必须手动跑 | 见 `docs/DB-MIGRATION.md`。部署新代码前先跑 `npm run db:migrate` |
| 8.4.2 | Neon HTTP client 两个坑 | ① 强制 tagged template，动态 SQL 走 `sql.query(text, params, options)`；② 不支持多语句 prepared statement，必须单语句粒度。脚本已绕过 |

---

## 9. 引用

| 主题 | 来源 |
| --- | --- |
| 已废止的 v1 / v2 | `docs/TEMPLATE-EDITOR.md` 旧版本（git history） |
| 数据模型 | `docs/FINAL-PLAN.md` §9 |
| **数据库迁移运维（脚本用法 / 当前状态 / 踩坑）** | **`docs/DB-MIGRATION.md`** |
| 视觉基础 | `docs/UI-PERFORMANCE.md` v1.1 |
| 系统硬约束（serverless / 时序挂在请求上） | `docs/FINAL-PLAN.md` §1 |
