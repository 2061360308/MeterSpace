# UI 感知性能改造方案

> 本文是 `FINAL-PLAN.md` 的**专题附录**，不改变 FINAL-PLAN 作为唯一实施入口的地位。
> 目标不是"让接口变快"，而是**让用户感觉不到等**。
>
> **版本 v1.1**（2026-09-12 全量核对代码后修订）。v1.0 的一批引用与实际代码不符，
> 且 U1 的写法有**数据丢失风险**，已重写。修订依据见 §0.2 事实核对表。
> 实施前请先读 §0 与 §5 的「前置」，不要直接从 §6 排期开工。
>
> **实施状态（2026-09-12）：U0–U9 已全部落地编码，并同步完成 Vercel/Geist 视觉改造。**
> 代码实现详见当日工作日志 `.workbuddy/memory/2026-09-12.md`。校验结果：
> `tsc --noEmit`（禁用增量）0 错误、`next lint` 0 warning/0 error、
> `next build` 编译成功（Collecting page data 阶段因缺 `DATABASE_URL` 中止，属环境限制）。
>
> **仍待完成**：迁移 `drizzle/0015`–`0018` 需在真实数据库执行。
>
> **与本文的两处有意偏差**（实施时按代码，不按本文）：
> 1. U1 本文建议「用 `updatedAt` 当释放时间戳、无需迁移」，实际**新增了**
>    `stop_invoke_id` / `release_requested_at`（`0015`）与 `provision_claimed_at`（`0018`）。
>    原因：`resumeReleasing` 需要精确的 hook invokeId 与独立的释放起点，
>    复用 `updatedAt` 会被后续任何写库操作污染。
> 2. U4 本文建议 `/api/ecs/price` 复用 `priceCache`，实际**新建了** `priceQuoteCache`（`0017`）。
>    原因：`describePrice` 明细形状（多计费项）与 `priceCache` 的 spot 估算形状不同，
>    混用会互相覆盖。

---

## 0. 现状盘点

### 0.1 核对后的现状（行号均为 2026-09-12 实测）

| 位置 | 现状 | 问题 |
|---|---|---|
| `workspace-list.tsx:82-86` | `setInterval(load, 10000)`，无条件常开 | 无缓存、切页回来重新拉、无进行中实例时也照打 |
| `workspace-detail.tsx:187-195` | `setInterval(load, 5000)`，仅在有 PROVISIONING/BOOTING/RUNNING 时开 | **effect 依赖 `[instances, load]`，而 `instances` 每次 poll 都变 → 每 5s 拆一次 setInterval 再建**，实际是漂移的链式定时 |
| `workspace-detail.tsx:198-229` | `setInterval(pollCloudStatus, 5000)`，仅 PROVISIONING/BOOTING 时开 | 与上一条并行。合计 **3 个请求 / 5s**（见 §0.2 第 4 条） |
| `instance-detail.tsx:122-128` | `setInterval(load, 3000)`，**已被 `status !== PROVISIONING && !== BOOTING` 拦住** | ✅ 停止/失败时本来就停。真正浪费的是启动期 3s 拉一次**全量** `/api/instances/[id]`（含 100 条日志），同时另有一条 `logs/stream` SSE 在推同一批日志 |
| `instances/service.ts:332-341` | `stopInstance` 内 `24 × 5s` 同步等待 | **最长 120s 同步阻塞，Vercel 免费版必然 504**。且该循环**不检查命令状态**，只在 output 里找 `OSS_USAGE=`，hook 失败就空等满 120s |
| `workspaces/service.ts:413-421` | `stopWorkspace` 内**同样的 24 × 5s 循环** | v1.0 漏写。这里是工作区列表「停止」按钮走的路 |
| `lib/cache.ts:6` | 模块级 `Map` | serverless 下实例隔离且随时回收，只算抖动抑制。被 `/api/ecs/price`、`/api/ecs/types`、`access.ts:133` 三处使用 |
| `/api/ecs/price`、`/api/ecs/types`、`/api/ecs/*` | 走上述 Map，未命中即打阿里云 | 最慢的一类，且数据变化慢（见 §0.2 第 1、5 条——DB 缓存表已存在但**没被这三个接口用上**） |
| `workspace-list.tsx:72`、`workspace-detail.tsx:155` | `fetch("/api/maintenance")` 不 await | ✅ 已经做对了，保持 |
| `(access)/access/[instanceId]/page.tsx:88` | `setInterval(..., 1000)` | ✅ 纯本地时钟，不联网，**无需改动** |

### 0.2 事实核对表（v1.0 的错漏，实施时以此为准）

**误报（v1.0 说错了）**

1. ❌ v1.0：「`cloudInstancePrices` 表（主键 provider+region+instanceType，天然缓存表）」
   → **该表不存在**。真实表是 `instanceCache` 与 `priceCache`（`db/schema.ts:352` / `:366`），主键同为 `provider+region+instanceType`。
   并且 `lib/price/service.ts` **已经实现了完整的 DB 缓存**（`getOrFetchPrices` / `getCachedPrices` / `getCachedInstanceTypes` / `upsertPrices`，24h TTL），`POST /api/ecs/[provider]/refresh-cache` 也已经在写入。
   → U4 不是「新增缓存表」，而是**把已有缓存接到现有三个接口上**。
2. ❌ v1.0：「`instance-detail.tsx:126` 实例已 STOPPED 仍在 3s 轮询，纯浪费」
   → 已由 `:124` 的状态判断拦住，STOPPED/FAILED 时**不轮询**。
3. ❌ v1.0：「`@tanstack/react-table` ⏳ 需要时再装」
   → **已安装且已在使用**（`components/workspaces/steps/instance-table.tsx:4,6`）。`react-virtual` 同样已装已用。
4. ❌ v1.0：「两条独立轮询打同一批接口」
   → 不准确。`load()` 打 `/api/workspaces/[id]` + `/api/workspaces/[id]/instances`，`pollCloudStatus` 打 `.../cloud-status`。是 **3 个请求 / 5s**，不是 2 个打同一接口。
5. ⚠️ v1.0：「`/api/ecs/*` 每次实时打阿里云」
   → 机理要写准：它们走 `lib/cache.ts` 的进程内 Map（price TTL 1h、types TTL 1d）。该 Map 在 serverless 下**等于没有**，所以*效果*上确实趋近实时打云。结论对，但改进点不是「加缓存表」而是「换用 DB 表」。

**漏报（v1.0 没写，不补上就实施不了）**

6. 🔴 **U1 有数据丢失风险。** `buildStopHook()`（`lib/userdata.ts:70-94`）不是指标采集脚本，它是**数据持久化的唯一入口**：打包未提交改动成 `.snapshots/<ts>.tar.gz`、导出容器内 code-server 配置到 `/mnt/config/roaming.tar.gz`、再清理工作树，最后才 `echo OSS_USAGE=...`。
   → 若照 v1.0 直接砍掉等待并删 ECS，**用户未提交的代码会丢**。
   → 正确做法：把**等待**移出请求路径，但**删除必须 gate 在 hook 完成之后**（见 §5 U1）。
7. 🔴 **`RELEASING` 在前端会显示成「已停止」。** `STATUS_META`（`lib/utils.ts:24-33`）只有 STOPPED/PROVISIONING/RUNNING/TERMINATING/FAILED，没有 `RELEASING`；而 `stopInstance` **已经**在写 `RELEASING`（`instances/service.ts:307`）。所有组件用 `STATUS_META[status] ?? STATUS_META.STOPPED` → 静默降级为「已停止」。
   → 另：`BOOTING` 同样缺条目（既有 bug，`workspace-detail.tsx:189` 却在判断它）。
8. 🔴 **`RELEASING` 没有任何回收路径。** `checkAndFixTimeouts` 只扫 `PROVISIONING`/`BOOTING`（`lifecycle.ts:25`、`:56`）。一旦异步续体失败，行会**永久卡在 RELEASING**；而 `workspace-detail.tsx:457-459` 的 `currentInstance` 只看 RUNNING/BOOTING/PROVISIONING → 界面上完全看不到它。
   → U1 必须同时给 RELEASING 加超时兜底（挂进 `/api/maintenance` 的 timeout 任务）。
9. 🔴 **202 之后没有执行者。** Vercel 免费版没有可依赖的 `waitUntil`/`after()` 持久执行，本项目也无 cron。
   → U1 的正确形态是「**请求只改状态 + 投递任务，真正的删除由下一次 `/api/maintenance` tick 收尾**」。前端每次进页面/轮询都会打这个接口，通路已存在。**必须把这条写死在计划里**，否则实施者会写 `setTimeout`，然后被平台杀掉。
10. 🔴 **`@tanstack/react-query` 尚未安装。** `package.json:17-44` 只有 react-table / react-virtual。U2 之前必须先补「装包 → 建 client provider → 挂到 `src/app/layout.tsx`」；`layout.tsx` 目前是纯 server component，全项目**没有任何 client provider**。v1.0 把这一步整个漏了。
11. 🟠 **`createInstance` 没有对应条目。** §2 矩阵把「创建实例」划进 2–10s 档并承诺 202+进度，但 §5 无此条目。`POST /api/workspaces/[id]/instances` 会同步跑完 VPC/安全组/镜像/ECS 创建（`instances/service.ts:141-195`），前端已被迫用 60s AbortController 兜（`workspace-detail.tsx:339-340`）。
12. 🟠 **日志 payload 没有 `id`。** stream（`logs/stream/route.ts:52-57`）和 `buildAccessSnapshot`（`access.ts:305-310`）都只发 `timestamp/level/phase/message`；而 `instance-detail.tsx:107` 用 `l.id === data.id` 去重 → **永远不匹配**，每次 SSE 重连整批日志重复追加。
    → U6/U8 之前必须先给 payload 加 `id`。
13. 🟠 **公开访问页没进盘点。** `/api/access/[instanceId]` 的 `resolveInstanceType`（`access.ts:133`）用进程内 Map + 冷启动直打 `getInstanceTypes`，首屏可能挂在云 API 上。
14. 🟠 **启动有两条路径，守卫不一致。** `/api/workspaces/[id]/start` → `startWorkspace` **没有任何「已在运行」守卫**；`/api/workspaces/[id]/instances` POST → `createInstance` 有三重守卫。收敛轮询/乐观更新时容易双开。
    → 顺带：`workspace-list.tsx:273` 的「启动」菜单项不带 body 调 start 路由，而该路由 zod 要求 `cloudInstanceId`（`start/route.ts:11`）→ 必然 400。属既有缺陷，与本次改造同区域，建议一并核对。
    → **（2026-09-12 已核实解决）** 列表页「启动」按钮与菜单项现均为 `router.push('/workspaces/<id>?tab=specs')` 导航（`workspace-list.tsx:321-335`、`:358-366`），不再直调该路由，400 问题不复存在。

---

## 1. 三条核心原则

1. **先给反馈，再给数据。** 任何超过 300ms 的操作都必须立刻有视觉响应。
2. **别重复问。** 同一份数据在 `staleTime` 内只请求一次；页面来回切不再打接口。
3. **别让请求干等。** 慢操作改成"提交任务 → 轮询/流式看进度"，而不是把 HTTP 连接挂在那儿。
   ⚠️ *补充（本项目专属）*：**"不干等"不等于"不等"**。停止实例必须等 stop-hook 跑完才能删
   （§0.2 第 6 条），要做的是把等待搬到 maintenance tick 上，不是删掉等待。

---

## 2. 延迟分档矩阵

| 接口耗时 | 手法 | 例子 | 对应条目 |
|---|---|---|---|
| 0–300 ms | 直接 await + 按钮 loading | 本地 DB 查询、设置读写 | — |
| 0.3–2 s | 骨架屏 + 乐观更新（先改本地后校正） | 工作区列表、模板列表、删除/重命名 | U5、U7 |
| 2–10 s | 返回已接收 + 状态位/阶段步骤 | 创建实例、模板实例化、zip 上传 | U6、U9 |
| > 10 s | 彻底异步化，允许离开页面 | 停止实例（当前 120s）、镜像构建 | U1 |

---

## 3. 四层改造地图

- **L1 反馈层**（用户直接看到）：骨架屏、步骤条、乐观更新、按钮 pending、toast
- **L2 数据编排层**：TanStack Query 缓存 / 预取 / 去重 / `refetchInterval` 动态开关
- **L3 接口形态层**：快接口直返；慢接口只改状态并投递任务，进度走日志流 + maintenance tick
- **L4 服务端缓存层**：复用已有 DB 缓存表（`instanceCache` / `priceCache`）；进程内 Map 仅作抖动抑制

---

## 4. 库选型

| 状态 | 库 | 用途 |
|---|---|---|
| **待安装** | `@tanstack/react-query` | 服务端状态缓存、乐观更新、预取、轮询 |
| ✅ 已装已用 | `@tanstack/react-virtual` | `components/workspaces/steps/instance-table.tsx` 已用于规格表；U8 复用到日志列表 |
| ✅ 已装已用 | `@tanstack/react-table` | 同上。**不要再"需要时再装"** |
| ❌ | `TanStack Router` | 与 Next App Router 冲突 |
| ❌ | `Store` / `Form` / `DB` / `Charts` / `Pacer` | 当前无对应痛点，表单用 rhf + zod |

注意：TanStack 是**无头库**，不给 UI 组件；**只有 Query 带缓存**，且缓存在浏览器端。

---

## 5. 改造点

### 前置 U0 — 接入 TanStack Query（**必须先做，否则 U2/U3 无法开工**）

1. 安装：`@tanstack/react-query`（当前 `package.json` 中不存在）
2. 新建 `src/app/providers.tsx`（`"use client"`），导出 `<Providers>`，内部 `new QueryClient()` 并接 `QueryClientProvider`
3. 在 `src/app/layout.tsx` 的 `<body>` 内包住 `{children}`（该文件目前是 server component，**无需**改成 client）
4. 默认值建议：`staleTime: 30_000`、`refetchOnWindowFocus: true`、`retry: 1`

### 前置 U0b — 补状态定义（U1/U3 依赖）

- `lib/utils.ts:24-33` 的 `STATUS_META` 补两条：`BOOTING`（如「启动中」yellow）、`RELEASING`（「释放中」yellow）
- `workspace-list.tsx:172` 的 `isBusy` 需要同时覆盖 `RELEASING`

---

| # | 改造 | 位置 | 优先级 |
|---|---|---|---|
| U1 | 停止实例异步化（去 120s 同步阻塞） | `instances/service.ts`、`workspaces/service.ts`、`instances/lifecycle.ts` | **P0** |
| U2 | 迁 TanStack Query，合并三个轮询点 | 见下 | **P0** |
| U3 | 轮询按需：仅进行中状态开 `refetchInterval` | 同上 | **P0** |
| U4 | 云探测接口改用已有 DB 缓存表 | `/api/ecs/price`、`/api/ecs/types`、`access.ts` | P1 |
| U5 | 骨架屏 + 局部 loading 替换整页 Spinner | 模板页、实例详情、访问页 | P1 |
| U6 | 启动阶段步骤条接日志流（含补 `id`） | 实例详情、创建流程 | P1 |
| U7 | 乐观更新：删除模板、改配置、启停按钮 | 模板页、设置页 | P2 |
| U8 | 日志长列表虚拟滚动 + 自动滚到底 | 实例详情 | P2 |
| U9 | `createInstance` 去同步化（v1.0 缺失项） | `instances/service.ts` + 创建流程 | P2 |

---

### U1 — 停止实例异步化（**P0，先读 §0.2 第 6/7/8/9 条**）

**目标**：停止请求立刻返回，不再 504；同时**不丢用户数据**。

**改法（两个 STOP 入口同一套逻辑）**

1. `stopInstance`（`instances/service.ts:286`）与 `stopWorkspace`（`workspaces/service.ts:374`）在把状态置为 `RELEASING` 后**立即 return**，并在同一请求内**只做**：`provider.runCommand(ecsInstanceId, region, buildStopHook())`，拿到 `invokeId` 后存库（用 `updatedAt` 作为本次释放的时间戳即可，**无需新列、无需迁移**）。
2. 真正的收尾放到 `lifecycle.ts` 新增 `resumeReleasing(userId)`，由 `/api/maintenance` 的 `timeout` 任务调用：
   - 扫 `status = RELEASING` 的行（限定当前用户）
   - 调 `provider.getCommandResult(invokeId, region)`，**判断 `status === "Finished" | "Failed"`**（当前 `stopInstance` 完全没判状态，是空等 120s 的根因）
   - **Finished** → 解析 `OSS_USAGE=`（拿不到就写 null）→ `deleteInstance` → 置 `STOPPED` + `stoppedAt` + `stopReason` + `logsExpireAt`
   - **Failed 或超过总时限（建议 10 分钟，按 `updatedAt` 算）** → 仍执行 `deleteInstance` 并置 `STOPPED`，`bootError` 记一笔
   - 单次 tick 内不要长等，最多 2–3 次查询后返回，剩下的交给下一次 tick
3. `AutoReleaseTime`（创建时已设，`instances/service.ts:166`）继续作为云厂商侧兜底。

**注意**
- **不要把 `deleteInstance` 提前到 hook 完成之前**——那是数据丢失。
- 用户可见反馈：RELEASING 期间前端显示「释放中」，不要显示「已停止」（依赖 U0b）。
- 空的 `stop-hook` 等价的快速路径已存在（`releaseIdleWorkspace`，`workspaces/service.ts:455`），**不要**把它当成手动停止的替代。

**验收**：连点两次停止，Vercel 日志无 504；DB 中该行最终是 `STOPPED`；OSS 快照目录出现新的 `*.tar.gz`。

---

### U2 — 迁 TanStack Query（**P0**）

改造点（v1.0 只说"三个组件"，此处补全）：

| 文件 | 现有 query | 目标 |
|---|---|---|
| `components/workspaces/workspace-list.tsx` | `/api/workspaces` | `useQuery(['workspaces'])` |
| `components/workspaces/workspace-detail.tsx` | `/api/workspaces/[id]` + `/api/workspaces/[id]/instances` + `.../cloud-status` | 三条独立 `useQuery`，`refetchInterval` 按 U3 动态 |
| `components/instances/instance-detail.tsx` | `/api/instances/[id]` | `useQuery`，轮询同样按 U3 |

- `fetch("/api/maintenance")` 的**不 await** 调用保持原样，放进 queryFn 开头
- 顺手修掉 `workspace-detail.tsx:187-195` 的 effect 依赖问题（迁到 Query 后自然消失）
- 详情页的 `useSearchParams` 需保持 Suspense 边界（Next 15 要求），迁移时别破坏

**验收**：/workspaces 与已访问过的详情页来回切，Network 面板无重复请求。

---

### U3 — 轮询按需（**P0**）

- `refetchInterval` 回调：仅当数据里存在 `PROVISIONING | BOOTING | RELEASING` 时返回 3000–5000，否则返回 `false`
- 覆盖 `PROVISIONING` 的**状态**判断要包含 `RELEASING`（当前所有组件都漏了它，见 §0.2 第 7 条）

**验收**：全部实例 STOPPED 时，静置 1 分钟 Network 面板零请求。

---

### U4 — 云探测接口改用已有 DB 缓存（P1）

**澄清**：缓存表已存在，不要再建。要改的是三个**没用上它**的地方：

1. `/api/ecs/price/route.ts:32-48` — 现在是 `cacheGet/cacheSet`（进程内 Map，TTL 1h）。改为读 `priceCache`（`lib/price/service.ts:89 getCachedPrices`），未命中再打云并 `upsertPrices`
2. `/api/ecs/types/route.ts:10-29` — 同上，改用 `getCachedInstanceTypes` / `upsertInstanceTypes`
3. `lib/instances/access.ts:133 resolveInstanceType` — 把 `specCache` 换成 `instanceCache` 表

- 手动刷新继续用已有的 `POST /api/ecs/[provider]/refresh-cache`（前端加一个刷新按钮即可）
- ⚠️ 改 DB 缓存会引入**跨实例可见的陈旧数据**，`refreshedAt` 判定（`price/service.ts:9 isFresh`，24h）要保持

**验收**：清空 `instance_cache` 后首次打开规格页会打云；第二次（含冷启动后的新实例）不打云。

---

### U6 — 启动阶段步骤条（P1）

**先看清现状**：`instance-detail.tsx:231-261` **已经有** `BOOT_PHASES` 步骤条（由 `instance.bootPhase` 驱动），`:92-120` **已经有** `logs/stream` 的 EventSource。v1.0 把它当成待做项是不准确的。

**真正要做的**：
1. 给 stream payload 补 `id`（`logs/stream/route.ts:52` 与 `access.ts:305` 两处），修掉 §0.2 第 12 条的重复追加
2. 步骤条的推进改为消费 stream 的 `phase` 字段，而不是等 3s 一次的全量 `/api/instances/[id]`
3. 配合 U3，把启动期的 3s 全量轮询降级为「仅靠 stream 推 + 低频校正（如 15s）」

---

### U8 — 日志虚拟滚动（P2）

依赖 U6 先补 `id`；`instance-detail.tsx:334` 现在是 `key={index}`，虚拟滚动下必须换成稳定 `id`。

---

### U9 — `createInstance` 去同步化 → **U9 反转**（v1.0 → v1.1 重新同步化）

**v1.0**：`instances/service.ts:141-195` 同步跑完 VPC/安全组/镜像/ECS 创建。按 U1 同款思路：先落 `PROVISIONING` 行并返回，实际创建交给后续 tick；前端靠 `logs/stream` 看进度。同时给 `startWorkspace` 补上与 `createInstance` 一致的重复启动守卫（§0.2 第 14 条）。

**v1.1 反转（2026-09-13）**：

- 基础网络资源（VPC/VSwitch/镜像/共享安全组）已落库（`region_resources` 表，迁移 0021），
  冷启动从 6 次云 API 降到 2 次（per-instance SG 查询 + `RunInstances`）。
- 既然「建 ECS」本身只剩 1~3 秒，**请求内同步跑完完全可行**——
  把 `instances/service.ts` 里的 `createInstance` 改成「落 PROVISIONING 行 → 立刻同步创建 ECS → 失败抛 502」；
  `useSpot` 这类参数从入参直接取，不必再落库（结构上杜绝「参数漏存」类 bug）。
- `resumeProvisioning()` **保留**——但角色降级为「兜底」：接住那些同步创建中
  请求中断/超时的孤儿行（`PROVISIONING` 且 `ecs_instance_id` 为空）。
- 详见 `lifecycle.ts` 的 `provisionInstanceCloud(instanceId)` 提取函数。

---

### 实施落地对照（2026-09-12 实装）

| # | 状态 | 关键落点 |
|---|---|---|
| U0 | ✅ | 装 `@tanstack/react-query`；新建 `src/app/providers.tsx`；`layout.tsx` 包裹 `<Providers>` |
| U0b | ✅ | `lib/utils.ts` `STATUS_META` 补 `BOOTING`/`RELEASING`；新增 `TRANSIENT_STATUSES` / `isTransientStatus()` |
| U1 | ✅（含偏差 1） | `stopInstance`/`stopWorkspace` 改为置 RELEASING + 投递 hook 后立即返回；`lifecycle.ts` 新增 `resumeReleasing()`，gate 在 hook Finished/Failed 之后才删 ECS；10 分钟兜底；与 `reapStale` 的 TERMINATING 路径留 30s 沉降期防重复收尾；`finalizeReleaseInline` 处理无 ECS 行 |
| U2 | ✅ | `workspace-list` / `workspace-detail` / `instance-detail` 三个组件全部迁到 `useQuery`；新增 `src/lib/api-client.ts`（`queryKeys`、`pingMaintenance`、`apiGet/apiSend`、轮询常量） |
| U3 | ✅ | `refetchInterval` 回调按 `isTransientStatus()` 返回 3000/5000 或 `false`；`/api/maintenance` 不再常开 |
| U4 | ✅（含偏差 2） | `/api/ecs/types`、`/api/ecs/price`、`access.ts resolveInstanceType` 全部改读 DB 缓存（`instanceCache` / `priceQuoteCache`）；`?refresh=1` 支持 |
| U5 | ✅ | `skeleton.tsx` 改为 sweep 动画；模板页/实例详情/工作区/余额卡/设置/账号/云实例页全部替换整页 Spinner 为骨架 |
| U6 | ✅ | SSE 与 `buildAccessSnapshot` payload 补 `id`；`instance-detail` 步骤条消费 stream `phase` |
| U7 | 🟡 部分 | 工作区列表停止/删除乐观更新、设置保存乐观更新已做；模板删除/重命名仍是「等响应」模式 |
| U8 | ✅ | `instance-detail` 新增 `LogViewer`（`useVirtualizer` + 自动滚底），key 用稳定 `id` |
| U9 | ✅（v1.1 反转） | v1.0 落 PROVISIONING 即返回交 tick；v1.1 **反转回同步创建**（基础资源落库后只剩 2 次云 API、1~3 秒），`resumeProvisioning()` 降级为孤儿行兜底；`provisionInstanceCloud()` 提取为两路共用的核心函数 |

**同批附带**：删除无引用的 shadcn 示例路由 `src/app/dashboard/`（页面上仍是
「Build Your Application / Data Fetching」样板，无任何导航入口）。

---

## 6. 落地顺序

0. **U0 + U0b（前置）**：装 Query、挂 provider、补 STATUS_META —— 不做事，但后面全依赖它
1. **P0（必修）**：U1 解超时（**含 RELEASING 回收**）+ U2/U3 收敛轮询 —— 这一步做完，卡顿感下降最明显
2. **P1（感知）**：U5 骨架屏 + U6 进度条（先补 `id`）+ U4 云接口换 DB 缓存
3. **P2（打磨）**：U7 乐观更新 + U8 虚拟滚动 + U9 创建异步化

---

## 7. 验收指标（可测）

| 指标 | 测法 |
|---|---|
| 已访问过的列表 < 100 ms 出现 | Query Devtools 观察 cache hit；Network 无新请求 |
| 有进行中实例时轮询 3–5 s | Network 面板时间轴 |
| **无进行中实例时零轮询** | 静置 60s，Network 面板请求数 = 0 |
| 点击后 < 100 ms 有反馈 | 按钮 pending / 骨架屏立刻出现（非整页遮罩） |
| 停止实例无 504 | Vercel Functions 日志搜 504；且该行最终为 `STOPPED` |
| 停止不丢数据 | OSS `ws-<id>/workspace/.snapshots/` 下出现新 `*.tar.gz`，`latest.tar.gz` 指向它 |
| 云探测首屏不打云 | 清空 `instance_cache` 后二次访问不打云 |

---

## 8. 反模式

- 全局 loading 遮罩（掩盖真实慢点，用户更焦虑）→ 用局部骨架屏
- 瀑布式串行请求（工作区 → 实例 → 日志三段相加）→ 并行或 prefetch
- `useEffect` + `useState` 手写 fetch（竞态/缓存/重试全是坑）→ 用 Query
- 服务端内存 Map 当持久缓存 → serverless 下不可靠，落 DB
- **砍掉慢操作里的等待当成"优化"** → 先确认那段等待在保护什么（U1 保护的是用户代码）
- **在 serverless 请求返回后再干活**（`setTimeout` / fire-and-forget）→ 函数会被回收，任务丢失
