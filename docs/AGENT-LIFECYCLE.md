# AGENT-LIFECYCLE（agent 启动/生命周期改造方案 v5）

> 本文为可执行规格。所有逐字决策以本文件为准，覆盖 FINAL-PLAN 中冲突表述（§10.3/10.5/10.6）。

## 1. 命名与单位

| 项 | 值 |
|---|---|
| 配置字段 | `autoRenewalMinutes`（workspaces）/ `defaultAutoRenewalMinutes`（settings） |
| 单位 | 整数分钟，范围 `[35, 7200]`，默认 `35`，粒度任意整数 |
| 阿里云参数 | `AutoReleaseTime`，绝对时间点（年/月/日/时/分），由 `buildAutoReleaseTime(autoRenewalMinutes)` 换算 |
| instances 租约列 | `auto_release_at timestamp with time zone` |
| 续期触发 | 心跳发现 `auto_release_at IS NULL` 或剩余 ≤10min → 后推 `now + autoRenewalMinutes`；取值链 `workspace.autoRenewalMinutes ?? settings.defaultAutoRenewalMinutes`（NULL 视为需续期，兜底存量行） |

## 2. 状态机

```
PROVISIONING --W1 超时----------> FAILED
PROVISIONING --首次心跳----------> BOOTING
BOOTING     --entry 失败---------> FAILED --> STOPPED(boot_failed)（立即删 ECS）
BOOTING     --/agent-ready-------> RUNNING
RUNNING     --is_idle=true-------> TERMINATING --> STOPPED(idle_release)
RUNNING     --心跳断联----------> TERMINATING --> FAILED(心跳缺失)
```

BOOTING 仅由心跳写入；payload 与 status 端点不改状态。
BOOTING 状态此前已存在于 schema/前端/查询/cloud-status（utils.ts:30、instances/service.ts:82、access.ts:303 等），仅缺写入方；前端与查询兼容，无需迁移。

## 3. 四窗口

| 窗口 | 阈值 | 判死 |
|---|---|---|
| W1 | 创建 5 分钟内未收到首次心跳（仍 PROVISIONING） | `checkAndFixTimeouts`（收窄后仅 PROVISIONING；基准 `bootStartedAt`，与心跳字段无关）→ FAILED + 释放 |
| W2 | entry 执行，默认 10 分钟，模板可调，上限 30 | 超时 → `/agent-error(timeout)` → FAILED + 立即销毁 |
| W3 | 闲置 ≥ idleMinutes（默认 30） | 心跳 `is_idle=true` → 落库即时快速释放（不跑 stop-hook） |
| W4 | 后端断联 ≥3 分钟判死；云侧 AutoReleaseTime 心跳续期兜底 | `reapStale` + 阿里云自动释放 |

BOOTING 不设后端时长检查；兜底 = ① agent 侧 entry_timeout 超时上报（W2）② RunInstances 创建时指定的 AutoReleaseTime（agent 失联即不再续期、到点云侧释放）。

## 4. entry 执行模型（D15）

- 契约：入口脚本必须退出。空脚本跳过 = 成功；退出码 0 = 成功；非 0 / W2 超时 = 失败。
- 长驻服务一律后台化：`nohup ... &`、`docker compose up -d`、`devcontainer up`（均返回）。
- 成功后：心跳 status=ready + `/agent-ready` → RUNNING。失败后：status=error + `/agent-error`。

## 5. 心跳契约（D3）

`/agent-heartbeat` 字段：
- `status` 枚举：`starting` → `running` → `ready` / `error`
- `is_idle: boolean`（新增）
- 后端处理：
  1. 首心跳：PROVISIONING → BOOTING（写库）
  2. `is_idle=true`（仅 RUNNING 生效；BOOTING/PROVISIONING 忽略）：转 TERMINATING 并即时快速释放
  3. 续期：`auto_release_at IS NULL` 或剩余 ≤10min → 后推 `now + autoRenewalMinutes`（取值链 `workspace.autoRenewalMinutes ?? settings.defaultAutoRenewalMinutes`；NULL 视为需续期，兜底存量行）

## 6. 日志通道（D16）

- 保留 `/agent-logs` 流式上报并落库（`instanceLogs`）。
- executor：入口 stdout/stderr + agent 事件 → 磁盘滚动文件 `/var/log/meterspace-agent/entry.log`（~20MB 轮转）；内存环形限量 5000 条；记录已流式水位。
- reporter：新增 `Flush()` 同步清空缓冲。
- 失败/超时顺序：drain executor 日志（水位后补 SendLog）→ `r.Flush()` → `/agent-error`。

## 7. 改动清单

### 7.1 数据库迁移
```sql
ALTER TABLE settings RENAME COLUMN default_release_hours TO default_auto_renewal_minutes;
ALTER TABLE settings ALTER COLUMN default_auto_renewal_minutes TYPE integer
    USING GREATEST(LEAST(ROUND(default_auto_renewal_minutes * 60), 7200), 35)::int;
ALTER TABLE settings ALTER COLUMN default_auto_renewal_minutes SET DEFAULT 35;

ALTER TABLE workspaces RENAME COLUMN release_hours TO auto_renewal_minutes;
ALTER TABLE workspaces ALTER COLUMN auto_renewal_minutes TYPE integer
    USING GREATEST(LEAST(ROUND(auto_renewal_minutes * 60), 7200), 35)::int;

ALTER TABLE instances ADD COLUMN auto_release_at timestamp with time zone;
ALTER TABLE workspaces ALTER COLUMN entry_timeout SET DEFAULT 600;
```
- `entry_timeout SET DEFAULT 600` 仅对后续插入生效；存量行 `entry_timeout=1800` 保留（≤ 新上限 1800，兼容）。
- `instances.auto_release_at` 存量行为 NULL，由 §5 续期「NULL 视为需续期」兜底，无需回填。
写入 `drizzle/`。

### 7.2 常量与自动释放
- `src/lib/templates/types.ts:96-97`：`DEFAULT_ENTRY_TIMEOUT=600`，`MAX_ENTRY_TIMEOUT=1800`（`:70` 注释同步「默认 1800 上限 3600」→「默认 600 上限 1800」）。
- 内置模板 `builtin.ts` 显式 `timeout: 1800` 恰等于新上限，保留（模板作者显式声明，不抬升默认）。
- `agent/config/config.go`：EntryTimeout 默认 `1800→600`（`:56` 注释同步更新）。
- `src/lib/instances/auto-release.ts`：`buildAutoReleaseTime(autoRenewalMinutes, fromMs?)`，clamp `[35min, 7200min]`，删除 `MIN_LEAD_MS`，输出 ISO 整分。
- `src/lib/userdata.ts:61`、`src/lib/workspaces/service.ts:99`：entryTimeout 兜底 `1800→600`。

### 7.3 字段重命名（releaseHours → autoRenewalMinutes）
- `src/lib/db/schema.ts:33,95-97`、`src/lib/aliyun/auth.ts:12,53,64-68`（`resolveReleaseProfile` 返回 `autoRenewalMinutes`）。
- `src/lib/workspaces/service.ts`：接口、`launchInstance`(88-108)、`preflightCheck`(137,159)（余额 `hourlyTotal * (autoRenewalMinutes/60)`）、`createWorkspace`(236)、`startWorkspace`(363,381)。
- `src/lib/launch-templates/service.ts:190,281`。
- `src/lib/instances/lifecycle.ts:725-734`：读 `autoRenewalMinutes`，持久化 `autoReleaseAt`。
- API 路由校验 `z.number().int().min(35).max(7200)`：
  - `src/app/api/workspaces/route.ts:39-40`（nullable optional）
  - `src/app/api/launch-templates/[id]/instantiate/route.ts:23-24`（nullable optional）
  - `src/app/api/settings/route.ts:55`
  - `src/app/api/workspaces/[id]/renew/route.ts`：body `{ autoRenewalMinutes }`（`z.number().int().min(35).max(7200)`）；成功后同步回写 `instances.auto_release_at = buildAutoReleaseTime(autoRenewalMinutes)`
- 前端：
  - `src/components/settings/settings-form.tsx`：label「自动续期 (分钟)」，input `min=35 max=7200 step=5`
  - `src/components/setup/setup-form.tsx`：同上
  - `src/components/workspaces/new-workspace-form.tsx:152`：`autoRenewalMinutes: null`

### 7.4 agent
- `agent/main.go:170-177`：删 payload 拉取失败 legacy fallback，改为 `r.ReportError(err, "payload")`。
- `agent/heartbeat/manager.go` + `agent/reporter/reporter.go`：心跳 status 枚举化、新增 `is_idle`。
- `agent/main.go:243`（idleWatchdog）：删除假打印，改为设置 `is_idle` 供心跳上报。
- `agent/executor/runner.go`：磁盘滚动日志 sink、内存环形限量 5000、流式水位。
- `agent/reporter/reporter.go`：新增 `Flush()`。
- `agent/main.go` onStatusChange 失败/超时分支：drain 日志 → `Flush()` → `/agent-error`。

### 7.5 后端路由
- `src/app/api/instances/[id]/agent-heartbeat/route.ts`：PROVISIONING→BOOTING 写入、`is_idle` 即时释放（仅 RUNNING 生效；BOOTING/PROVISIONING 忽略该字段）、租约续期（≤10min 后推）。
- `src/lib/instances/lifecycle.ts`：`checkAndFixTimeouts` 收窄仅 PROVISIONING（删除 BOOTING 判定）；`reapStale` 删除 BOOTING 前 5 分钟豁免（lifecycle.ts:300-304），BOOTING/RUNNING 统一以 `HEARTBEAT_TIMEOUT_MS=3min` 判心跳缺失；新增 `releaseIdleInstance`。
- `src/lib/providers/aliyun.ts`：`supportsAutoRelease` 能力标记（仅阿里云启用云侧兜底）。

## 8. 文档

- 本文件即完整方案。
- 更新 `docs/DB-MIGRATION.md:238`：release_hours real/0.5 → `default_auto_renewal_minutes` integer，默认 35，范围 [35,7200]。
- TEMPLATE-PROTOCOL.md：明确长驻服务必须后台化。

## 9. 验收

- `buildAutoReleaseTime(35)` ≈ now+35min（无 +1min 损耗）；`buildAutoReleaseTime(7200)` = 5 天。
- 心跳剩余 ≤10min 时 `auto_release_at` 后推；断联后云侧按租约销毁。
- entry 退出码契约：非 0 / W2 超时 → FAILED 立即销毁。
- 失败路径：日志先落库后报错；磁盘滚动文件存在；内存 ≤5000 条。
- 续期接口、设置/向导输入步进 min35/max7200/step5 生效。

## 10. 边界

- tencent/aws 的 setAutoReleaseTime 为 no-op：W4 云侧兜底仅阿里云生效。
- 阿里云下限 30 分钟；35 分钟下限含 5 分钟缓冲，后端不再额外加损耗。

## 11. 启动模板规范 / 接口 / UI 配套

### 11.1 规范（模板元数据）
- `timeout`（入口执行超时，秒）：默认 **600**，范围 **[30, 1800]**（上限 30 分钟）。由 `src/lib/templates/types.ts:96-97` 常量驱动。
- entry 执行契约（D15）写入模板规范文档：
  - Command 型：必须退出；退出码 0=成功；非 0=失败；空脚本=跳过即成功；超时=失败→按 D7 销毁。
  - 长驻服务必须后台化：`nohup ... &`（重定向 stdout/stderr）、`docker compose up -d`、`devcontainer up`（均返回后退出）。
- 续期时长不进模板元数据：`autoRenewalMinutes` 优先顺序 = 用户传入 > settings 默认；模板不声明。

### 11.2 接口改动
| 端点/文件 | 改动 |
|---|---|
| `src/app/api/launch-templates/[id]/instantiate/route.ts:24` | `releaseHours` → `autoRenewalMinutes: z.number().int().min(35).max(7200).nullable().optional()` |
| `src/lib/launch-templates/service.ts:181,190,281` | `InstantiateLaunchBody` 字段改名；insert `autoRenewalMinutes: body.autoRenewalMinutes ?? s.defaultAutoRenewalMinutes`；`entryTimeout` 默认 600 来自常量 |
| `GET /api/launch-templates`、`GET /api/launch-templates/[id]` | 响应新增 `entryTimeout`（= `resolveEntryTimeout(definition)`），供 UI 展示；`timeout` 原生字段保留 |
| `POST /api/launch-templates` + `/upload` | 走 `parseTemplateDefinition`，timeout 边界随常量收紧，无代码改动 |
| `/agent-error` phase | 增加 `runtime`（运行期致命错误）：后端按 FAILED→立即销毁同一路径处理 |

### 11.3 UI 改动
| 页面 | 改动 |
|---|---|
| wizard 第 3 步 `src/components/workspaces/steps/step-environment.tsx` | 「当前配置」卡 + 两行：入口超时（`entryTimeout`，分钟显示）、闲置阈值（`activity.idleMinutes`，默认 30）；选中的是 Command 型时，卡下方加提示「入口需在超时内退出；长驻服务请后台化（nohup / up -d）」；不加续期输入 |
| 向导提交 `src/components/workspaces/new-workspace-form.tsx:152` | `releaseHours: null` → `autoRenewalMinutes: null` |
| `/launch-templates` 列表卡 `src/components/launch-templates/launch-template-list.tsx` | +「超时 10 分钟」徽标（`entryTimeout`，缺省默认 600 秒） |
| `/launch-templates/[id]` 详情 `src/app/(protected)/launch-templates/[id]/page.tsx` | 头部卡 +「入口超时 X 分钟」「闲置阈值 X 分钟」；Command 型时显示契约提示 |
| `/launch-templates/new/upload` 预览 `src/app/(protected)/launch-templates/new/upload/page.tsx` | 不加超时输入；仅读 template.json；元数据卡下补「入口超时」只读展示（默认 10 分钟） |

### 11.4 决策记录补充
- **D17**：RUNNING 期间 agent 检出致命状态（持久化目录不可用等）→ `/agent-error phase=runtime` → 后端 FAILED→立即销毁（复用 D7 路径）。当前无自检点，接入点后续随实际自检逻辑实现预留。