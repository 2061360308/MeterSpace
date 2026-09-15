# CLOUD-FUNCTION-WORKERS（云函数后台任务：创建/释放跟踪）

> 版本：v1.0
> 日期：2026-09-15
> 状态：**计划（已定稿）**，未落地
> 部署约束：Vercel 免费版 serverless —— 无后台、无 Cron（`docs/FINAL-PLAN.md` §1 D8）
>
> **本文是云端函数时序改造的唯一实施依据。** 落地前先读 `docs/DB-MIGRATION.md` §4/§5（迁移流程与账本现状）与第 10 章部署顺序。

---

## 目录

- [0. 背景 / 动机](#0-背景--动机)
- [1. 决策表](#1-决策表)
- [2. 架构](#2-架构)
- [3. poll 单步语义（状态机）](#3-poll-单步语义状态机)
- [4. 数据模型与迁移](#4-数据模型与迁移)
- [5. 接口契约](#5-接口契约)
- [6. 云函数包](#6-云函数包)
- [7. 删除清单](#7-删除清单)
- [8. 修改清单](#8-修改清单)
- [9. 保留不变（agent 驱动 / 目录读）](#9-保留不变agent-驱动--目录读)
- [10. 部署顺序](#10-部署顺序)
- [11. 验证清单](#11-验证清单)
- [12. 残留边角（接受）](#12-残留边角接受)
- [13. 相关文档](#13-相关文档)

---

## 0. 背景 / 动机

Vercel serverless 无后台进程，此前所有时序逻辑依赖两类"懒触发"：

1. **前端懒触发 `/api/maintenance`**（`pingMaintenance`，`src/lib/api-client.ts:27`）：一次性跑 6 个打云维护任务（provision / timeout / release / idle / stale / ip，`src/app/api/maintenance/route.ts:21-75`）——**没人打开页面 = 全部不推进**。
2. **前端读接口内嵌维护**：多个 GET 顺手打云/超时检查（`checkAndFixTimeouts`）来"修正奖励一致性"——**前端刷新一次 = 一次云扫描甚至删资源**。

问题归纳：
- 关页不推进：用户创建实例后关掉浏览器，实例可能永远停在 PROVISIONING。
- 读接口打云：列表/详情/访问页各自打云，与 maintenance 的检查互相重复触发。
- 三套维护逻辑叠加，职责散落。

**方案**：引入**平台无关的云函数轮询器**作为唯一时序执行器，逐步替代 maintenance 的所有职责；**删除 `/api/maintenance` 与 `pingMaintenance`**；前端读接口全部去云化（纯 DB 读）。云函数是**系统必备组件**：未部署 = 系统出错（实例停在中间状态），**不做 tick 兜底**。

---

## 1. 决策表

| # | 决策 | 结论 |
|---|---|---|
| D1 | 云函数语言/放置 | **Node.js ≥18，单文件零依赖 `.mjs`**，`functions/poller/`（仓库根，与 `agent/`、`scripts/` 平级，不参与 Next 构建） |
| D2 | 云函数定位 | **必备组件**。未部署=系统出错，不设计兜底 |
| D3 | 任务载体 | **不建 `background_tasks` 表**。状态全部活在现有 `instances` 行上；后端零任务状态维护 |
| D4 | 部署登记持久化 | settings 表新增**jsonb 列** `cloud_functions`（settings 是单行列表 schema.ts:23-65，非 key-value）：`[{provider, platform, functionId, region, qualifier?, namespace?}]`，登记挂在 admin 行，**无新表** |
| D5 | 触发抽象标准 | `CloudProvider.invokeCloudFunction({task, instanceId, intervalSec?, timeoutSec?})`，各 provider 实现平台调用；未配置部署 → log + skip |
| D6 | 函数内多任务路由 | **事件名路由**：`handlers[task]`。同函数承载 `instance-tracking`（create+boot+release 依据实例行状态自动分派）与未来任务类型（`command-tracking` 等） |
| D7 | 默认时间参数 | `intervalSec=10s`，`timeoutSec=600s`（云函数单次执行自限时） |
| D8 | 前端读接口 | 纯 DB 读，返回 `lastCloudStatus`/`lastCloudCheckedAt` 快照列（cloud-status 端点退役） |
| D9 | maintenance | **整体删除**（`/api/maintenance` + `pingMaintenance` + 前端调用处） |
| D10 | stale / idle / ip | 全删。idle 由 agent `is_idle` 与云侧 AutoReleaseTime 兜底；ip 由 poll 成功即回填 + agent-ready 双保险；启动期（BOOTING→RUNNING 前）时长兜底在 agent 侧（entry_timeout 上报 → FAILED）与云侧 AutoReleaseTime，poll 不介入（对齐 lifecycle.ts:58-59 W1） |
| D11 | 超时权威 | 后端 poll 端点是唯一判定方（基于 `instances` 行字段）；云函数 `timeoutSec` 只约束自身执行时长，超时静默退出（恶意无兜底，见 D2） |
| D12 | 回调 | **无 report 端点**。poll 单步内完成终裁并落库（task 与实例行同事务/同条件更新），云函数只在 `{state}` 非 `PENDING` 时自终 |

---

## 2. 架构

```
创建路径落 ecsInstanceId ─────────→ provider.invokeCloudFunction({task:"instance-tracking",...})
释放入口置 RELEASING ─────────────→ provider.invokeCloudFunction({task:"instance-tracking",...})
        ↓                            （fire-and-forget，失败仅 log；事件只带 task/instanceId/interval/timeout）
  云函数 functions/poller（Node .mjs，平台无关，无 AK/DB/私有）
    循环: POST <RUNNER_URL>/api/internal/instances/:id/poll    (Bearer TASKS_WORKER_TOKEN)
          ├ {state:"PENDING"}       → sleep(intervalSec)  继续
          ├ {state:"SUCCEEDED"|"FAILED"|"TIMEOUT"} → 静默退出（任务自终）
          └ 自身运行到 timeoutSec（默认 600s）→ 静默退出（D2：无兜底）
```

- **云函数不自带 provider / 凭据 / DB**：事件只带 `instanceId`，region/provider/凭据由后端 poll 端点从库内行查出。
- **poll 是归一单入口**：创建跟踪、释放收尾由同一个端点依据实例行现状 `status` 分派（见 §3）；启动期（BOOTING）时长兜底在 agent 侧与云侧，poll 不介入。
- **后端零任务状态**：不新表、不记录轮询进度，每次触发使用 `instances` 行现有字段（status / ecsInstanceId / bootStartedAt / autoReleaseAt …）。

---

## 3. poll 单步语义（状态机）

`POST /api/internal/instances/:id/poll`，Bearer `TASKS_WORKER_TOKEN`（`crypto.timingSafeEqual`）。依据实例行当前 `status` 分派：

```
PROVISIONING ── 超时?  now > bootStartedAt + BOOT_TIMEOUT_MS(5min, lifecycle.ts:16)
     ├─ 是 → handleExpiredInstance(row)（删 ECS + 标 FAILED）→ {state:"TIMEOUT"}
     └─ 否 → provider.getInstanceCloudStatus(ecsInstanceId, region)
             ├─ Running       → getInstancePublicIp → 置 BOOTING + publicIp（条件更新 WHERE status='PROVISIONING'）
             │                  → {state:"PENDING"}   （等 agent-ready → RUNNING）
             ├─ Released/无资源 → provider.deleteInstance(Force，幂等) + 标 FAILED → {state:"FAILED"}
             └─ 其它           → {state:"PENDING"}

BOOTING ── poll 不杀，只等 agent 驱动收敛（对齐 lifecycle.ts:58-59 W1：
      BOOTING 时长兜底在 agent 侧 entry_timeout 上报 与 云侧 AutoReleaseTime，后端无 BOOTING 超时）
     └─ 恒 {state:"PENDING"}
        · agent-ready → RUNNING；agent 报 entry_timeout/agent-error → FAILED（agent 驱动，poll 不落库）
        · 两者皆缺（agent 从未启动且无上报）→ 云 AutoReleaseTime 兜金钱，DB 遗留幽灵 BOOTING（残留边角 #4）

RELEASING / TERMINATING ── 释放收尾（替代 resumeReleasing）
     → advanceReleaseRow(row)（原 resumeReleasing per-row 主体，lifecycle.ts:575-670 抽取）
       · TERMINATING 且 updatedAt < TERMINATING_SETTLE_MS(30s)：让开快速释放 → PENDING
       · 无 ecsInstanceId → finalizeRelease（直接 STOPPED）→ SUCCEEDED
       · RELEASING：preStopAckedAt 已置 → finalizeRelease（删 ECS + STOPPED）→ SUCCEEDED
       · 超过 RELEASE_HOOK_DEADLINE_MS(10min, lifecycle.ts:27) → 强制释放 → SUCCEEDED
       · 未 settle：preStopDispatchedAt 间隔足够 → 重发 pre-stop；否则 → PENDING
     → 上述过程中 deleteInstance 幂等（云侧天然幂等）

RUNNING / STOPPED / FAILED / 其它终态 → {state:"SUCCEEDED"}（无事可做，幂等）
```

通用规则：
- 所有落库一律 `WHERE status=<旧状态>` **条件更新**，与 agent-ready / agent-heartbeat / agent-error 并发时原子防重复推进。
- 每次调用必落 `lastCloudStatus` / `lastCloudCheckedAt` 到 `instances` 行（前端快照数据源）。
- 打云失败 / provider 异常 → catch 后返回 `{state:"PENDING"}`（下次轮询重试，不误判终态）。

---

## 4. 数据模型与迁移

### 4.1 `instances` 加 2 列（poll 快照；供前端纯 DB 读展示云进度）

`schema.ts:210` 之前在 `lastHeartbeatAt`（:181）附近追加：

| 列 | 类型 | 说明 |
|---|---|---|
| `lastCloudStatus` | `text` NULL | 最近一次 poll 查到的云侧状态（Running / Stopped / Released …） |
| `lastCloudCheckedAt` | `timestamp with time zone` NULL | 最近一次 poll 检查时间 |

### 4.2 settings 新增 jsonb 列：`cloud_functions`

> ⚠️ `settings` 是**单行列表**（`schema.ts:23-65`，`userId` 主键、各配置为具名字段），不是 key-value 存储。部署登记作为新列挂在 admin 的 settings 行（单 admin 部署假设）。

```json
[
  { "provider": "aliyun", "platform": "fc",     "functionId": "<FC 函数名>",        "region": "cn-hangzhou" },
  { "provider": "tencent","platform": "scf", "functionId": "<SCF 函数名>",       "region": "ap-guangzhou", "namespace": "default" },
  { "provider": "aws",    "platform": "lambda", "functionId": "<Lambda 函数名>", "region": "us-east-1" }
]
```

- 字段：`functionId` = 函数名（FC/SCF/Lambda 通用）；`qualifier?` = 版本/别名（缺省取平台默认 LATEST／`$LATEST`，三家通用）；`namespace?` = 腾讯 SCF 命名空间（缺省 `default`）。
- 由部署环节人工写入（admin settings PUT 或直接 DB）。
- `invokeCloudFunction` 按 `provider` 匹配该数组；找不到 → log + skip（D5）。

### 4.3 迁移文件

**`drizzle/0006_cloud_function_tracking.sql`**（写后同步 `drizzle/meta/_journal.json` 追加 `{idx:6, version:"7", when:<ms>, tag:"0006_cloud_function_tracking", breakpoints:true}`，并改 `src/lib/db/schema.ts`，按 `docs/DB-MIGRATION.md` §4 流程）：

```sql
ALTER TABLE "instances" ADD COLUMN "last_cloud_status" text;

ALTER TABLE "instances" ADD COLUMN "last_cloud_checked_at" timestamp with time zone;

ALTER TABLE "settings" ADD COLUMN "cloud_functions" jsonb DEFAULT '[]'::jsonb;
```

> ⚠️ 表结构改动只此三列。**不 DROP 任何列**（`provision_claimed_at` 等遗留列保留，见 §8.6）。

---

## 5. 接口契约

### 5.1 `CloudProvider.invokeCloudFunction`（抽象标准，`src/lib/providers/types.ts`）

```ts
invokeCloudFunction?: (params: {
  /** 事件名，云函数内部 handlers 路由用；本版本固定 "instance-tracking" */
  task: string;
  instanceId: string;
  intervalSec?: number;   // 默认 10
  timeoutSec?: number;    // 默认 600
}) => Promise<void>;       // fire-and-forget
```

- **aliyun**：读 settings `cloud_functions` 匹配 `platform==="fc"` 的部署 → 用 **FC3 OpenAPI `InvokeFunction`（`x-fc-invocation-type: Async`，事件函数）** 触发，endpoint `fc.{region}.aliyuncs.com`，官方 `@alicloud/openapi-util` 做 ACS3-HMAC-SHA256 签名（`src/lib/aliyun/fc.ts`）。post 事件负载 `{task, instanceId, intervalSec, timeoutSec}`。失败仅 `console.error`，不抛出（不阻塞创建/停止主流程）。
  - 函数须在控制台把**超时设为 ≥660s**（事件函数默认 3s），否则预算未跑完就被杀。
  - 预留：腾讯 SCF 走 `ScfClient.Invoke({InvocationType:"Event"})`（异步，避开同步接口 300s 上限）、AWS Lambda 走 `Invoke({InvocationType:"Event"})`；同一份 `functions/poller` 的 `{task,...}` 事件负载三者透传。
- **tencent / aws**：实现接口；settings 无对应部署 → `console.warn` + 直接返回（D5：skip）。

### 5.2 后端内部 poll 端点

`POST /api/internal/instances/:id/poll`（新文件 `src/app/api/internal/instances/[id]/poll/route.ts`）

- 鉴权：`Authorization: Bearer <TASKS_WORKER_TOKEN>` + timingSafeEqual。
- 逻辑：载入 `instances` 行 + 关联 `workspaces` → §3 状态机单步 → 返回归一化 `{state}`，状态码 200（含错误态也 200，函数无需区分网络失败与业务失败）。

### 5.3 环境变量

| 端 | 新增 env | 说明 |
|---|---|---|
| 后端（Vercel） | `TASKS_WORKER_TOKEN` | 共享密钥（`openssl rand -base64 32`），`invokeCloudFunction` 与 poll 端点共用 |
| 云函数 | `RUNNER_URL` | 后端根 URL，拼 `/api/internal/instances/:id/poll` |
| 云函数 | `TASKS_WORKER_TOKEN` | 与后端同值 |

不新增 `TASKS_RUNNER_URL`（云函数调用目标地址来自 settings 部署登记 + 各 provider 实现，不走后端静态 env）。

---

## 6. 云函数包

### 6.1 目录与文件

```
functions/poller/
  index.mjs        # 入口：handlers 路由 + 轮询循环
  package.json     # { "type":"module", "engines": {"node": ">=18"} }，零依赖
scripts/build-fc-poller.sh   # 打包：cd functions/poller && zip → .dist/fc-poller.zip
```

- `.gitignore` 加 `.dist/`；`package.json` 加 `"build:fc-poller": "bash scripts/build-fc-poller.sh"`。
- 纯 `.js` 不参与 tsconfig/eslint/next build。
- 构建产物 `fc-poller.zip` **手动上传**到目标平台（阿里云 FC / 腾讯 SCF / AWS Lambda），平台选择 handler 名。

### 6.2 入口契约

```js
const handlers = {
  // 状态机自动分派（§3）：同一任务类型覆盖 create/boot/release
  "instance-tracking": runInstanceTracking,
  // 未来任务类型：e.g. "command-tracking", "acr-tracking"
};

export async function main(event) {
  const { task, instanceId, intervalSec = 10, timeoutSec = 600 } = event ?? {};
  const handler = handlers[task];
  if (!handler) { console.error(`[poller] unknown task: ${task}`); return; }
  return handler({ RUNNER_URL, TASKS_WORKER_TOKEN, instanceId, intervalSec, timeoutSec });
}
exports.handler = main;       // Lambda / FC
exports.main_handler = main;  // SCF
```

### 6.3 轮询循环（`runInstanceTracking`）

```
截止 = Date.now() + timeoutSec*1000
while (Date.now() < 截止) {
  res = POST ${RUNNER_URL}/api/internal/instances/${instanceId}/poll
         headers: Authorization: Bearer ${TASKS_WORKER_TOKEN}
  if (res.ok) {
    state = (await res.json()).state
    if (state !== "PENDING") return;      // SUCCEEDED/FAILED/TIMEOUT → 自终
  }
  // 网络失败/非200：照常 sleep 重试（后端幂等，不产生副作用）
  await sleep(intervalSec*1000)
}
// 到达自身截止：静默退出（D2 无兜底）
```

### 6.4 超时预算

| 任务 | timeoutSec | 依据 |
|---|---|---|
| instance-tracking（创建） | 600s | > BOOT_TIMEOUT_MS(300s)，必在窗口内观察到超时自终 |
| instance-tracking（释放） | `max(600, ceil(RELEASE_HOOK_DEADLINE_MS/1000)+60)` = 660s | hook 最坏等待 10min 内必须覆盖到强制释放；660s < SCF 上限 900s |

调用方不传 timeoutSec 时由后端按上述规则计算传入（`invokeCloudFunction` 内部按 task 兜底默认）。

---

## 7. 删除清单

| 项 | 位置 | 说明 |
|---|---|---|
| `/api/maintenance` 整个文件 | `src/app/api/maintenance/route.ts` | 六个 task 全部被替代 |
| `pingMaintenance()` | `src/lib/api-client.ts:27-37` | 及其在 workspace-list / workspace-detail / instance-detail 的全部调用 |
| 前端读接口内嵌 `checkAndFixTimeouts` | `src/app/api/workspaces/route.ts:55`；`src/app/api/workspaces/[id]/route.ts:63`；`src/lib/instances/service.ts:66 (createInstance)、:184 (listInstances)、:227 (getInstance)`；`src/app/api/access/[instanceId]/route.ts:72-83` | 一并删 import |
| `workspaces/[id]` 打云 | `src/app/api/workspaces/[id]/route.ts:90-98`（`getProvider().getInstance`） | 前端不再需要实时 ECS 对象 |
| `cloud-status` 端点 | `src/app/api/workspaces/[id]/instances/[instanceId]/cloud-status/` 整目录 | 前端改读 `lastCloudStatus` 快照 |
| access 打云分支 | `src/lib/instances/access.ts:300-313`（`includeCloud` → `getInstanceCloudStatus`） | 改直接返回 `instance.lastCloudStatus` |
| lifecycle 六函数 | `checkAndFixTimeouts`(:193)、`resumeProvisioning`(:890)、`resumeReleasing`(:540)、`reapStale`(:395)、`releaseIdle`(:216)、`backfillInstanceIps`(:458) | 被 poll/advanceReleaseRow/agent 驱动替代 |
| createInstance 的 claim | `src/lib/instances/service.ts:153-157`（`provisionClaimedAt`） | `resumeProvisioning` 已删，认领无竞争方；`provisionInstanceCloud` 自身幂等（:806 `if (row.ecsInstanceId) return`） |
| 前端 cloud-status 轮询 | `workspace-detail.tsx:206-213`；`queryKeys.cloudStatus`（`api-client.ts:73-74`） | 改从普通列表查询展示快照列 |

---

## 8. 修改清单

| 文件 | 改动 |
|---|---|
| `src/lib/providers/types.ts` | CloudProvider 加 `invokeCloudFunction?`（§5.1） |
| `src/lib/providers/aliyun.ts` | 实现：读 settings `cloud_functions` → `src/lib/aliyun/fc.ts` |
| `src/lib/providers/tencent.ts` / `aws.ts` | 实现接口：无部署 → warn + skip |
| `src/lib/db/schema.ts` | instances 加 `lastCloudStatus` / `lastCloudCheckedAt` |
| `src/lib/instances/lifecycle.ts` | (a) 删 §7 六个函数；(b) 抽 `advanceReleaseRow(row)`（原 `resumeReleasing` per-row 主体，:575-670，lifecycle 内部函数）；(c) **create 入队**：`provisionInstanceCloud` 写库成功后（:876 之后）`invokeCloudFunction({task:"instance-tracking", instanceId:row.id, timeoutSec:600})`；(d) 新增并导出 `pollInstanceStep(instanceId)`：§3 状态机单步 + `advanceReleaseRow`（在 lifecycle.ts 内部复用 `isExpired`/`handleExpiredInstance`/`finalizeRelease`/`getCloudStatus`/`releaseInstance` 等私有件，poll route 不直接 import 这些私有函数） |
| `src/lib/workspaces/service.ts` | (a) **create 入队**：`startWorkspace` 写库后（:391 之后，拿到 ecsInstanceId 时）`invokeCloudFunction`；(b) **release 入队**：`stopWorkspace` 在 pre-stop 下发尝试完成后（:455 `dispatchPreStop` 之后）`invokeCloudFunction`；(c) **release 入队**：`releaseIdleWorkspace` 在 pre-stop 下发尝试完成后（:518 之后）`invokeCloudFunction`（放在下发改装之后，避免 `advanceReleaseRow` 见 `preStopDispatchedAt` 为空立即重发造成 pre-stop 双击） |
| `src/lib/instances/service.ts` | (a) **release 入队**：`stopInstance` 在 no-ecs 短路（:290-294 已直接 STOPPED）与 pre-stop 下发完成之后 `invokeCloudFunction`；(b) 删 3 处 `checkAndFixTimeouts`（:66/:184/:227）与 claim（:153-157） |
| `src/lib/instances/access.ts` | 删 `includeCloud` 打云分支，改读 `instance.lastCloudStatus` |
| `src/app/api/workspaces/route.ts` / `workspaces/[id]/route.ts` / `access/[instanceId]/route.ts` | 删内嵌调用与 import（§7） |
| `src/app/api/internal/instances/[id]/poll/route.ts` | **新**：鉴权 + 调 `pollInstanceStep(instanceId)`（§3 状态机逻辑全在 lifecycle.ts） |
| `src/components/*` | 删 `pingMaintenance` 调用、`cloud-status` 轮询；列表/详情展示 `lastCloudStatus`/`lastCloudCheckedAt`（PROVISIONING/BOOTING 时显示云进度，RUNNING 显示"就绪"） |
| `functions/poller/{index.mjs,package.json}` | **新**：§6 |
| `src/lib/aliyun/fc.ts` | **新**：FC3 OpenAPI InvokeFunction(Async) + `@alicloud/openapi-util` ACS3 签名（依赖 `@alicloud/openapi-util`） |
| `scripts/build-fc-poller.sh` | **新**：打包 `.dist/fc-poller.zip` |
| `package.json` | 加 `"build:fc-poller"` 脚本 |
| `.gitignore` | 加 `.dist/` |
| `.env.example` | 加 `TASKS_WORKER_TOKEN=` |
| `drizzle/0006_cloud_function_tracking.sql` + `drizzle/meta/_journal.json` | **新**：§4.3 |

入队封装建议（三处复用）：

```ts
async function enqueueTracking(type: "create" | "release", instanceRowId: string, provider: string) {
  try {
    const p = getProvider(provider);
    await p?.invokeCloudFunction({
      task: "instance-tracking",
      instanceId: instanceRowId,
      intervalSec: 10,
      timeoutSec: type === "create" ? 600 : 660,
    });
  } catch (e) {
    console.error(`[enqueueTracking] ${type} invoke failed:`, e); // D2：不阻塞主流程
  }
}
```
位置：`provisionInstanceCloud` / `startWorkspace`（create），`stopInstance` / `stopWorkspace` / `releaseIdleWorkspace`（release）。**共 5 个调用点、3 个既有 RELEASING 入口 + 2 个创建入口。**

---

## 9. 保留不变（agent 驱动 / 目录读）

| 项 | 位置 | 理由 |
|---|---|---|
| `renewInstanceLease` + 心跳调用 | `agent-heartbeat/route.ts:141` | agent 活着才续租，是云侧 AutoReleaseTime 的前置动作 |
| `releaseIdleInstance`（is_idle 即时释放） | `agent-heartbeat/route.ts:95-101` | agent 驱动的空闲释放，不需要云函数 |
| `agent-ready` 抢 IP + 转 RUNNING | `agent-ready/route.ts:55-60` | agent 自驱动；RUNNING 语义只能由 agent-ready 落 |
| `agent-error` 失败立即销毁 | `agent-error/route.ts:57-74` | agent 自驱动 |
| `provider.*`（createInstance/getCloudStatus/getPublicIp/deleteInstance…） | `src/lib/providers/*` | 接口不动，只新增 `invokeCloudFunction` |
| 目录类云读 | `/api/cloud-instances`、`/api/ecs/regions`、`/api/price/calculate` | 主动查目录，非状态维护 |
| `finalizeRelease` / `dispatchPreStop` / `isExpired` / `handleExpiredInstance` / `getCloudStatus` / `releaseInstance` | `lifecycle.ts` | 在 `pollInstanceStep` / `advanceReleaseRow` 内部复用（均为私有，不跨文件 import）；`dispatchPreStop` 来自 `src/lib/agent/command` |

---

## 10. 部署顺序

严格按序，**先迁 DB 再发代码**（`docs/DB-MIGRATION.md` 6.8）：

1. 写 `drizzle/0006_cloud_function_tracking.sql` + journal idx=6 + `schema.ts` 加列 → 本地 `npx tsc --noEmit` → `npm run db:migrate` → `npm run db:verify`。
2. 后端代码：providers 接口 + poll 端点 + advanceReleaseRow + 入队接线 + 前端去云化 + maintenance 删除 → `npm run build` → 部署 Vercel（env 加 `TASKS_WORKER_TOKEN`）。
3. `npm run build:fc-poller` → `.dist/fc-poller.zip` → 上传目标平台建函数（FC/SCF/Lambda），env 写 `RUNNER_URL` + `TASKS_WORKER_TOKEN`，handler 名按平台选（`main` / `handler` / `main_handler`）。
4. 后端 settings 写入 `cloud_functions` JSON（§4.2）。
5. 回归验证（§11）。

> ⚠️ 步骤 2 与步骤 3/4 之间系统处于"无执行器"状态：这是预期的（D2）。先发代码再登记部署，实例会停在中间态直到函数就位。

---

## 11. 验证清单

| # | 场景 | 期望 |
|---|---|---|
| 1 | 创建实例（`/api/workspaces/[id]/instances` POST） | 落库 ecsInstanceId → invoke → 函数轮询 → 云 Running → BOOTING + publicIp + lastCloudStatus 落库 → agent-ready → RUNNING → 函数自终 |
| 2 | 启动实例（`/api/workspaces/[id]/start`） | 同 1（另一创建入口） |
| 3 | 创建后 agent 启动期失联 | poll 全程 `{state:"PENDING"}` 不落库；agent 报 entry_timeout/agent-error → FAILED + ECS 删除（agent 驱动）；云 AutoReleaseTime 兜金钱 |
| 4 | 创建失败 / 云 Released | poll 失败释放 → deleteInstance(幂等) + FAILED |
| 5 | 停止/释放（stopInstance / stopWorkspace / 空闲 is_idle） | RELEASING → invoke → poll 走 advanceReleaseRow → hook ack → STOPPED |
| 6 | 前端读接口 | grep 断言：前端 GET 链路上零 `getProvider(` / `checkAndFixTimeouts` / `/cloud-status` 调用 |
| 7 | maintenance | `/api/maintenance` 已删除；`pingMaintenance` 与调用处已删除 |
| 8 | IP | 创建成功即 publicIp 回填（poll 双保险），`backfillInstanceIps` 已删 |
| 9 | 并发幂等 | poll 与 agent-ready/heartbeat 同时到达同一行，条件更新防双推进，无重复删 ECS |
| 10 | 云函数被杀 | 实例停在当前状态（**系统出错，预期**，D2） |

---

## 12. 残留边角（接受）

| # | 边角 | 接受理由 |
|---|---|---|
| 1 | **invoke 丢失窗口**：`provisionInstanceCloud` 写库 ecsInstanceId 与 invoke 之间请求崩溃 → 该行无人轮询 | 窗口极窄；agent 正常启动时自身心跳会把 PROVISIONING 推到 BOOTING（`agent-heartbeat/route.ts` 状态迁移），自愈 |
| 2 | **RUNNING 后 agent 失联**：DB 短暂显示"幽灵 RUNNING" | 钱由云侧 AutoReleaseTime 兜底（默认 autoRenewalMinutes=35min，`renewInstanceLease` 停止续租即到期自释）；不为此引入定时触发源 |
| 3 | 云函数执行期超预算退出（网络抖动导致 600s 内没轮询完） | 事件型单函数可能提前退出；同边角 1，agent 路径自愈 |
| 4 | **BOOTING 后 agent 从未启动且无上报**（镜像损坏）：poll 不杀 → DB 遗留幽灵 BOOTING，云按 AutoReleaseTime 到期释放 | 与边角 2（RUNNING 幽灵）同类：金钱由云侧兜底；不为此引入后端 BOOTING 超时杀（W1 现状一致，`lifecycle.ts:58-59`） |

---

## 13. 相关文档

| 主题 | 位置 |
|---|---|
| serverless 时序约束 / maintenance 起源 | `docs/FINAL-PLAN.md` §1（D8）、§10 |
| 停止收尾 / pre-stop 协议 | `docs/AGENT-PRESTOP.md` |
| agent 生命周期 / 租约续期 | `docs/AGENT-LIFECYCLE.md` §5、§7.5 |
| 迁移流程 / 账本 | `docs/DB-MIGRATION.md` §4、§5 |
| 前端懒处理与 UI 时序 | `docs/UI-PERFORMANCE.md` U1/U9 |