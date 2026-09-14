# AGENT-PRESTOP（释放流程改造：stop-hook 迁移到 agent 执行）

> 可执行规格。本文件只含操作步骤，不含动机说明。

## 协议

```
后端                       agent :9527/command              后端
  │── POST /command ──────▶│ action="pre_stop"                │
  │ {script,timeout,...}   │  校验签名 → 落盘脚本 → 后台执行    │
  │                        │  执行回收脚本，解析 OSS_USAGE=     │
  │                        │── POST /api/instances/[id]/agent-ready-stop ──▶
  │                        │  { token, ok, oss_usage_bytes?, error? }
  │── resumeReleasing ────▶│  删 ECS → status=STOPPED
```

- 触发入口：手动停止、心跳 `is_idle=true`、扫描式 `releaseIdle`。统一置 `RELEASING` 后 dispatch pre-stop。
- 指令内嵌脚本：`buildStopHook()` 输出作为 `script` 字段随指令下发。
- 兜底：`RELEASE_HOOK_DEADLINE_MS`（10min）内未收到 ready-stop → 强制删 ECS。
- 新增列：`instances.pre_stop_dispatched_at`、`instances.pre_stop_acked_at`。
- 鉴权：agent 侧复用现有 HMAC（`crypto.VerifySignature`，消息=`workspaceId:action:timestamp`，key=`instances.accessToken`）。
- 无存量实例兼容：当前未发布，云助手路径整体移除，不停留兼容分支。

---

## 1. 数据库迁移

**1.1** 新建 `drizzle/0003_pre_stop.sql`：

```sql
ALTER TABLE "instances"
  ADD COLUMN "pre_stop_dispatched_at" timestamp with time zone;

ALTER TABLE "instances"
  ADD COLUMN "pre_stop_acked_at" timestamp with time zone;
```

**1.2** 在 `drizzle/meta/_journal.json` 的 `entries` 末尾追加：

```json
{ "idx": 3, "version": "7", "when": <Date.now()>, "tag": "0003_pre_stop", "breakpoints": true }
```

**1.3** 执行 `npm run db:migrate`，确认输出含 `0003`。

**1.4** `src/lib/db/schema.ts` —— instances 表（`stopInvokeId` 附近）追加字段，注释标注用途：

```ts
preStopDispatchedAt: timestamp("pre_stop_dispatched_at", { withTimezone: true }),
preStopAckedAt: timestamp("pre_stop_acked_at", { withTimezone: true }),
```

---

## 2. 后端：agent 指令客户端

新建 `src/lib/agent/command.ts`：

- `const AGENT_CONTROL_PORT = 9527;`
- `export async function dispatchPreStop(input: { instanceId: string; workspaceId: string; publicIp: string; accessToken: string; script: string; reason?: string }): Promise<void>`
  - `timestamp = Math.floor(Date.now() / 1000).toString()`
  - `signature = createHmac("sha256", accessToken).update(\`${workspaceId}:pre_stop:${timestamp}\`).digest("hex")`
  - `POST http://${publicIp}:${AGENT_CONTROL_PORT}/command`，body `{ action: "pre_stop", timestamp, signature, script, timeout: 120, reason }`
  - 超时 5s；`2xx` 视为成功；**`409` 视为成功**（agent 侧已在执行，幂等）；其它 status >= 400 抛错。
- `export async function getAgentPublicUrl(instanceId: string): Promise<string | null>`
  - 查 `instances` 的 `publicIp`；空返回 `null`。

---

## 3. 后端：ready-stop 端点

新建 `src/app/api/instances/[id]/agent-ready-stop/route.ts`，`POST`：

- body schema：`{ token: string, ok: boolean, oss_usage_bytes?: number|null, error?: string|null }`
- 鉴权：`verifyAccessToken(id, token)`
- 更新：`preStopAckedAt = new Date()`；`ok=true` 时 `ossUsageBytes = body.oss_usage_bytes ?? null`；`ok=false` 时 `bootError = body.error ?? "agent pre-stop failed"`；`updatedAt`
- 不推进状态（`RELEASING` 保持，由 `resumeReleasing` 收尾）
- 返回 `{ ok: true }`

---

## 4. 后端：停止入口

**4.1** `src/lib/instances/service.ts` `stopInstance`（:253）：

- 保留状态机前置与 `ecsInstanceId` 为空分支（:289 `finalizeReleaseInline`）
- 云资源存在时：`dispatchPreStop`（需 `instances.publicIp`、`instances.accessToken`、`workspace.id`；不需要 provider/region，签名 key 仅依赖 accessToken，同时移除 `stopInstance` 中不再使用的 `getProvider` / `buildStopHook` import）
  - 成功 → `preStopDispatchedAt = now`（写库），hook 结果字段语义改为 `hookDispatch` 记录 pre-stop 下发结果（`"ok"` / `"failed"`）
  - 失败（含 publicIp 为空）→ 不抛，记 `bootError = "pre-stop 下发失败，将自动重试：..."`，`hookDispatch = "failed"`
- 移除 `provider.runCommand(instance.ecsInstanceId, region, buildStopHook())` 与 `stopInvokeId` 写入

**4.2** `src/lib/workspaces/service.ts` `stopWorkspace`（:417）：

- 同上替换 `provider.runCommand(...)` 为 `dispatchPreStop`；`stopInvokeId` 置空清理逻辑删除（不再使用该列）

**4.3** `src/lib/workspaces/service.ts` `releaseIdleWorkspace`（:485）：

- 状态机改为 `RELEASING` + `releaseRequestedAt = now` + `stopReason = "idle_release"`
- `dispatchPreStop` 成功写 `preStopDispatchedAt`；失败记日志不抛
- 删除直接 `deleteInstance` 与 `status: "STOPPED"` 收尾；收尾交给 `resumeReleasing`
- 保留 auditLogs `IDLE_RELEASE`

**4.4** `src/lib/instances/lifecycle.ts` `releaseIdleInstance`（:337）：

- `status !== "RUNNING" || !ecsInstanceId` 仍返回 `"skipped"`
- 改为 `RELEASING` + `releaseRequestedAt = now` + `stopReason = "idle_release"` + dispatch pre-stop；删除直接删 ECS 与 STOPPED 收尾
- 返回 `"released"`
- **心跳 route**（`src/app/api/instances/[id]/agent-heartbeat/route.ts:97`）：`releaseIdleInstance(...)` 调用包 `try/catch`，异常记录日志不影响 `renewInstanceLease` 分支

---

## 5. 后端：resumeReleasing 重写

`src/lib/instances/lifecycle.ts` `resumeReleasing`（:557）：

- 常量新增：`RELEASE_PRESTOP_REDISPATCH_GAP_MS = 60_000`
- **select 追加 4 列**（当前 select 只有 12 个字段，缺少读不到）：`publicIp`、`preStopAckedAt`、`preStopDispatchedAt`、`ossUsageBytes`
- `RELEASING` 分支：
  1. `acked = row.preStopAckedAt != null`
  2. `!acked`：若 `preStopDispatchedAt` 为空，或距上次 ≥ `RELEASE_PRESTOP_REDISPATCH_GAP_MS`：查 `publicIp`，非空则 `dispatchPreStop` 并更新 `preStopDispatchedAt`；失败记日志
     - `pending++; continue`
  3. `acked`：`ossUsage` 取行值；`hookSettled = true`
- `!hookSettled && !overDeadline` → `pending++`（保留）
- 删 ECS → `finalizeRelease`：`forced = !hookSettled`；**`stopReason` 强删时取 `row.stopReason ?? "manual_timeout"`，正常时 `row.stopReason ?? "manual"`**（修复闲置走 RELEASING 后被记成 `manual_timeout` 的问题）
- 删除云助手路径：`stopInvokeId` 分支、`getCommandResult` 轮询、`parseOssUsage`、`RELEASE_POLL_ATTEMPTS` / `RELEASE_POLL_GAP_MS` / `RELEASE_REDISPATCH_GRACE_MS`（均无存量消费方）

---

## 6. 后端：安全组放行 agent 端口

`src/lib/ecs/provisioning.ts` `ensureInstanceSecurityGroup`（:253）：**仅在 create 分支**（`createSecurityGroup` 之后）追加放行；prefetched / existing 命中路径不重复调用（per-instance SG 名唯一，重试命中已有 SG 时规则已在）：

```ts
await authorizeIngress(creds, region, sgId, "9527/9527", "0.0.0.0/0", "agent-control");
```

- `9527` 常量与 `src/lib/agent/command.ts` 的 `AGENT_CONTROL_PORT` 保持一致，注释互指。

---

## 7. agent 改造

**7.1** `agent/config/config.go`：新增字段 `PreStopTimeout time.Duration`（`json:"pre_stop_timeout"`），默认 `120 * time.Second`；`loadFromFile`（config.json 字段 `pre_stop_timeout`）与 `loadFromEnv`（env `AGENT_PRE_STOP_TIMEOUT`）两处都加解析，范围 clamp `[30s, 300s]`。

**7.2** `agent/reporter/reporter.go`：新增

```go
type ReadyStopPayload struct {
    Token        string `json:"token"`
    Ok           bool   `json:"ok"`
    OSSUsageBytes int64 `json:"oss_usage_bytes,omitempty"`
    Error        string `json:"error,omitempty"`
}

func (r *Reporter) ReportReadyStop(ok bool, ossUsageBytes int64, errMsg string) error {
    return r.post("/agent-ready-stop", ReadyStopPayload{
        Token: r.backendToken, Ok: ok, OSSUsageBytes: ossUsageBytes, Error: errMsg,
    })
}
```

**7.3** 新建 `agent/stop/runner.go`：

```go
type Runner struct {
    workdir string
    logf    func(level, msg string)
}

func NewRunner(workdir string, logf func(level, msg string)) *Runner

// RunPreStop 执行回收脚本，解析输出中的 OSS_USAGE=(\d+)。
func (r *Runner) RunPreStop(scriptPath string, timeout time.Duration) (ossUsage int64, err error)
```

- `exec.CommandContext(ctx, "bash", scriptPath)`，`Dir = workdir`
- stdout/stderr 逐行交给 `logf`，与 `OSS_USAGE=` 正则匹配，匹配行不再写日志（或写到日志但由 parse 处理，二选一且一致）
- 超时返回 `err`，进程 Kill

**7.4** `agent/api/server.go` `handleCommand`：

- 移除 `prepare_reclaim` / `force_stop` 占位分支
- 新增 `case "pre_stop"`：
  - body 结构追加 `Script string`、`Timeout int`、`Reason string`
  - 校验：`request.Script == ""` → 400；`Timeout <= 0` → 120；`Timeout > 300` → 300
  - 落盘 `/opt/agent/pre-stop.sh`（0700，原子写：tmp + rename）
  - 防重：包内 `sync.Mutex` + `running bool`；正在执行 → `http.Error(..., http.StatusConflict)`
  - 后台 goroutine：
    1. `stopRunner.RunPreStop(scriptPath, timeout)`，每行日志 `reporter.SendLog({Phase:"pre_stop", ...})`，同时 `fmt.Printf` 到 stdout
    2. `reporter.Flush()`
    3. 解析 `OSS_USAGE`；成功 → `ReportReadyStop(true, usage, "")`；失败/超时 → `ReportReadyStop(false, 0, errMsg)`
  - 立即返回 `200 {"status":"accepted","action":"pre_stop"}`
- `Server` 结构新增字段 `stopRunner *stop.Runner`、`stopMu sync.Mutex`、`stopRunning bool`；`NewServer` 传入 `cfg.WorkspaceDir` 构造 runner

**7.5** `agent/main.go`：`api.NewServer(...)` 传参更新（runner 构造不再需要其他改动）；`agentVersion` bump `1.0.0 → 1.1.0`。

---

## 8. 文档同步

- `docs/DB-MIGRATION.md`：追加 `0003_pre_stop` 登记到迁移清单
- `docs/AGENT-LIFECYCLE.md` §5：`is_idle=true` 语义改为「置 RELEASING 并下发 pre-stop」；§7.5 `releaseIdleInstance` 描述同步
- `docs/FINAL-PLAN.md`：stop-hook 执行主体由「云助手 RunCommand」改为「agent 执行 pre-stop」（涉及时序说明章节，改一处描述即可，不重写）

---

## 9. 构建与验证

**9.1** 后端：`npx tsc --noEmit`

**9.2** agent：`go build ./...` 与 `go vet ./...`

**9.3** 端到端（手动）：
1. 创建并启动工作区，确认实例 `RUNNING`、`publicIp` 非空
2. 手动释放：观察 agent stdout 出现 `pre_stop` 执行日志；`instances.oss_usage_bytes` 落库；ECS 被删；状态 `STOPPED`
3. 空闲路径：短 `idle_minutes`（如 1 分钟）触发心跳 `is_idle=true`，验证同链路
4. 超时路径：停止 agent 进程后手动释放，验证 10min 后强删、`stopReason` 带 `_timeout` 后缀
5. 幂等：RELEASING 期间再点释放，确认无重复 dispatch 导致脚本二次执行

**9.4** 安全组：创建实例后确认 `agent-control` 规则存在（`9527/9527` → `0.0.0.0/0`），非该端口无新增开放。