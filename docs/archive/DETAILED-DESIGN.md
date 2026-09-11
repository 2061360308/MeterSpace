# MeterSpace 详细设计：工作空间模型 · 执行语义 · 探活与闲时销毁

> 版本：v4.0
> 日期：2026-09-11
> 状态：设计阶段（替代 v3 的 `LIFECYCLE-DESIGN.md` 中已被推翻的部分）
>
> 本文补齐 v3 缺失的三块：**① 工作空间文件模型 ② 阶段执行的精确语义 ③ agent 探活与闲时销毁链路**
>
> v3 中被推翻的决策：~~4 个固定阶段脚本 + 附件文件~~ → 改为**工作空间目录树 + 固定入口脚本**

---

## 一、为什么改：v3 的问题

v3 提出的"4 个固定脚本 + 附件文件"模型有两个致命缺陷：

| 缺陷 | 说明 |
|---|---|
| **无法写复杂脚本** | 4 个 TEXT 字段意味着用户只能写 bash。Python / Node / Go 脚本没有立足之地——不能带 `package.json`、不能带 `requirements.txt`、不能带多文件模块 |
| **"附件"是伪装的目录树** | 附件本质是"路径 + 内容"，那它和文件树有什么区别？既然是文件树，就应该正大光明地做 |

**用户判断正确**：要做工作空间，就必须支持真实的多文件目录树。

---

## 二、工作空间文件模型

### 2.1 核心概念

```
WorkSpace（用户编辑的逻辑单位）
  ├─ FileTree（目录树，任意多文件）
  ├─ Entrypoints（固定入口，平台按约定调用）
  └─ Config（超时、端口、环境变量）
```

### 2.2 目录约定

实例上的固定布局：

```
/opt/ws/                      ← 工作空间根（只读挂载点，平台写入后不变）
├── entrypoints/              ← 入口脚本（平台按约定调用）
│   ├── pre.sh                ← 执行前（必须 bash）
│   ├── main.sh               ← 主任务（必须 bash）
│   ├── post.sh               ← 执行后（必须 bash）
│   └── onerror.sh            ← 失败后（可选，必须 bash）
│
├── scripts/                  ← 用户在 entrypoint 里调用的其他脚本（任意语言）
│   ├── setup.py
│   ├── build.ts
│   └── deploy.sh
│
├── files/                    ← 配置文件 / 数据文件
│   ├── nginx.conf
│   ├── init.sql
│   └── .env
│
├── src/                      ← 用户代码（可选）
│
└── package.json              ← 任意位置、任意类型

/workspace/                   ← 业务数据目录（持久化到 OSS，与 /opt/ws 分离）
/opt/agent/                   ← agent 自身
```

**为什么入口固定为 `.sh`？**

因为实例上不保证有 python/node。平台不能假设解释器存在——那是用户 `pre.sh` 的职责（装 Python 就得在 `pre.sh` 里装）。

**入口可以是"薄壳"**：用户完全可以这样写 `main.sh`：

```bash
#!/bin/bash
exec python3 /opt/ws/scripts/app.py
```

或者：

```bash
#!/bin/bash
cd /opt/ws && npm start
```

**这就是"固定入口 + 任意语言"的正确解法**：入口是 bash（因为一定存在），实际逻辑交给用户选择的解释器。

### 2.3 超时（用户要求）

**超时挂在入口上，不挂在文件上**——因为文件不"执行"，入口才执行。

```typescript
export interface EntrypointConfig {
  enabled: boolean;
  path: string;          // 相对 /opt/ws 的路径，默认 entrypoints/pre.sh
  timeout: number;       // 秒。默认按阶段不同
  required: boolean;     // 失败是否阻断（onerror 固定 false）
  continueOnError: boolean;
}
```

默认超时：

| 入口 | 默认超时 | 理由 |
|---|---|---|
| `pre` | 900s (15min) | 要装 Docker / Node 等，耗时最长 |
| `main` | 900s (15min) | 可能含构建、`docker pull` |
| `post` | 300s (5min) | 一般是健康检查 |
| `onerror` | 120s (2min) | 只做日志收集 |

**超时上限**：单入口最大 3600s，总执行时间上限 5400s（防呆）。

**超时行为**：`SIGTERM` → 等待 10s → `SIGKILL`（进程组，`kill -TERM -$PGID`）。必须杀进程组，否则 `docker run` 之类的子进程会残留。

### 2.4 文件元数据

```typescript
export interface WorkspaceFile {
  path: string;          // 相对 /opt/ws 的路径，如 scripts/app.py
  content: string;       // 文本内容（UTF-8）
  mode: string;          // 权限，默认 "0644"；.sh/.py 建议 "0755"
  executable: boolean;   // 语义标记（等价于 mode 含 x 位）
  size: number;          // 字节数（服务端计算）
  updatedAt: string;     // ISO 时间戳
}
```

**限制建议**：

| 项 | 限制 | 理由 |
|---|---|---|
| 单文件大小 | 128 KB | 这是"脚本+配置"，不是代码仓库；大文件应走 git clone |
| 文件总数 | 200 | 同上 |
| 总大小 | 2 MB | 避免 UserData / 注入体积过大 |
| 路径深度 | 6 层 | 防呆 |
| 路径字符 | `[A-Za-z0-9._/-]`，禁 `..` | 防目录穿越 |
| 二进制文件 | 不支持 | 文本模型；二进制请放 OSS 或走下载 |

**为什么不做二进制**：一旦支持二进制，就需要 base64 编码、体积膨胀、编辑器无法显示，收益为负。需要二进制的场景（如 clash 内核）走"下载 URL"。

### 2.5 数据模型

```sql
-- 工作空间文件树（扁平存储，路径为唯一键）
CREATE TABLE workspace_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,          -- 相对 /opt/ws
  content     TEXT NOT NULL DEFAULT '',
  mode        TEXT NOT NULL DEFAULT '0644',
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, path)
);
CREATE INDEX idx_workspace_files_ws ON workspace_files(workspace_id);

-- 入口配置
ALTER TABLE workspaces ADD COLUMN entrypoints JSONB DEFAULT '{
  "pre":     {"enabled": true,  "path": "entrypoints/pre.sh",  "timeout": 900, "required": true,  "continueOnError": false},
  "main":    {"enabled": true,  "path": "entrypoints/main.sh", "timeout": 900, "required": true,  "continueOnError": false},
  "post":    {"enabled": true,  "path": "entrypoints/post.sh", "timeout": 300, "required": true,  "continueOnError": false},
  "onerror": {"enabled": true,  "path": "entrypoints/onerror.sh","timeout": 120, "required": false, "continueOnError": true}
}';

-- 暴露端口（声明式，可选；脚本也可动态写 ports.json）
ALTER TABLE workspaces ADD COLUMN declared_ports JSONB DEFAULT '[]';

-- 环境变量（注入到入口脚本的执行环境）
ALTER TABLE workspaces ADD COLUMN script_env JSONB DEFAULT '[]';
-- [{ key, value, secret }]  secret=true 时前端掩码显示

-- 闲时与生命周期
ALTER TABLE workspaces ADD COLUMN idle_action TEXT DEFAULT 'stop';
-- 'stop'（保留工作区）| 'destroy'（连工作区一起删）
ALTER TABLE workspaces ADD COLUMN debug_mode BOOLEAN DEFAULT FALSE;

-- 旧字段处置
ALTER TABLE workspaces ALTER COLUMN image_uri DROP NOT NULL;

-- instances：运行时
ALTER TABLE instances ADD COLUMN exposed_ports JSONB DEFAULT '[]';
ALTER TABLE instances ADD COLUMN current_entrypoint TEXT;   -- 当前执行到哪个入口
ALTER TABLE instances ADD COLUMN stage_results JSONB DEFAULT '[]';
-- [{ entrypoint, status, exitCode, startedAt, finishedAt, durationMs, logCount }]
```

---

## 三、阶段执行的精确语义

### 3.1 执行流程

```
agent 启动
  ↓
拉取工作空间文件（从后端 API，一次性）
  ↓
写入 /opt/ws/{entrypoints,scripts,files,...}
  ↓
按顺序执行入口：
  ┌─ pre.sh ──── 失败? ──┐
  │                      │
  └─ main.sh ── 失败? ───┤
                         │
  └─ post.sh ── 失败? ───┤
                         │
                   失败：跑 onerror.sh（忽略其结果）
                         ↓
                   上报 FAILED + 销毁
                         ↓
                   成功：读 ports.json → 上报 READY
```

### 3.2 退出码语义

| 退出码 | 含义 | 处理 |
|---|---|---|
| `0` | 成功 | 继续下一入口 |
| `1-125` | 一般失败 | 阻断，转 `onerror` |
| `126` | 不可执行 | 阻断（权限问题，通常是被写坏了） |
| `127` | 命令未找到 | 阻断（用户脚本 bug） |
| `128+n` | 被信号 n 终止 | 超时（`143`=SIGTERM，`137`=SIGKILL）单独标记为 `TIMEOUT` |

**空脚本不视为失败**：文件不存在、为空、或仅含注释和空行 → 跳过（记 INFO 日志），不算失败。这条很重要，否则用户不填 `post.sh` 就会失败。

### 3.3 逐入口执行（agent 侧伪代码）

```go
type StageResult struct {
    Entrypoint string    `json:"entrypoint"`
    Status     string    `json:"status"`     // success | failed | timeout | skipped
    ExitCode   int       `json:"exitCode"`
    StartedAt  time.Time `json:"startedAt"`
    FinishedAt time.Time `json:"finishedAt"`
    DurationMs int64     `json:"durationMs"`
    LogCount   int       `json:"logCount"`
}

func (e *Executor) RunAll(eps map[string]EntrypointConfig) error {
    order := []string{"pre", "main", "post"}
    results := []StageResult{}

    for _, name := range order {
        cfg := eps[name]
        if !cfg.Enabled {
            results = append(results, StageResult{Entrypoint: name, Status: "skipped"})
            continue
        }

        path := filepath.Join("/opt/ws", cfg.Path)
        if isBlank(path) {
            results = append(results, StageResult{Entrypoint: name, Status: "skipped"})
            e.addLog(LogEntry{Level: "info", Phase: name,
                Message: fmt.Sprintf("[%s] script is empty, skipped", name)})
            continue
        }

        if err := e.ReportPhase(name); err != nil { /* 忽略上报失败 */ }

        res := e.runStage(name, path, cfg.Timeout)
        results = append(results, res)

        if res.Status != "success" {
            // 失败：跑 onerror
            if onerr := eps["onerror"]; onerr.Enabled {
                op := filepath.Join("/opt/ws", onerr.Path)
                if !isBlank(op) {
                    e.ReportPhase("on_error")
                    e.runStage("onerror", op, onerr.Timeout)  // 结果丢弃
                }
            }
            e.ReportStageResults(results)
            return fmt.Errorf("entrypoint %s %s (exit %d)", name, res.Status, res.ExitCode)
        }
    }

    e.ReportStageResults(results)
    return nil
}
```

### 3.4 超时实现的坑

`exec.CommandContext` 只杀直接子进程，不杀进程组。用户脚本里 `docker run -d` 或 `npm start &` 会残留。正确做法：

```go
func (e *Executor) runStage(name, path string, timeoutSec int) StageResult {
    cmd := exec.Command("bash", path)
    cmd.Dir = "/opt/ws"
    cmd.Env = append(os.Environ(), "/opt/ws/files...")  // 见 §3.5
    // 关键：独立进程组
    cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

    start := time.Now()
    // ... 启动、读 stdout/stderr ...

    done := make(chan error, 1)
    go func() { done <- cmd.Wait() }()

    select {
    case err := <-done:
        return buildResult(name, start, cmd.ProcessState.ExitCode(), err)
    case <-time.After(time.Duration(timeoutSec) * time.Second):
        // 杀整个进程组
        syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
        select {
        case <-done:
        case <-time.After(10 * time.Second):
            syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
            <-done
        }
        return StageResult{Entrypoint: name, Status: "timeout", ...}
    }
}
```

### 3.5 执行环境

入口脚本执行时注入：

```bash
# 工作目录
cd /opt/ws

# 平台提供的环境变量
WS_ROOT=/opt/ws
WS_FILES=/opt/ws/files
WS_WORKSPACE=/workspace
WS_EXPOSED_PORTS_FILE=/opt/agent/ports.json
WS_INSTANCE_ID=<uuid>
WS_REGION=cn-hangzhou

# 用户自定义环境变量（script_env）
# 以及平台代理注入的 http_proxy / https_proxy / NO_PROXY
```

**`WS_EXPOSED_PORTS_FILE` 是关键**：用户脚本用 `$WS_EXPOSED_PORTS_FILE` 就知道该往哪写端口，不用记路径。

### 3.6 端口声明

两种途径，优先级：**脚本动态写 > 工作区声明式**。

```bash
# 途径 1（推荐）：脚本自己写
mkdir -p "$(dirname "$WS_EXPOSED_PORTS_FILE")"
cat > "$WS_EXPOSED_PORTS_FILE" <<'EOF'
[{"port": 8080, "label": "App", "protocol": "http"}]
EOF
```

```json
// 途径 2：工作区 declared_ports（无脚本写时兜底）
[{"port": 8080, "label": "App", "protocol": "http"}]
```

**合并规则**：脚本写的文件存在 → 用它；否则用 `declared_ports`；两者都空 → 默认 `[{port:8080, label:"默认", protocol:"http"}]`。

**为什么脚本优先**：端口常是运行时决定的（dev server 自动选端口、容器随机映射）。声明式无法覆盖。

---

## 四、agent 探活与闲时销毁

### 4.1 现状与缺陷

**现状链路（有严重缺陷）**：

```
[agent 侧]
  heartbeat.Manager.heartbeatLoop()  每 60s+jitter
    → sendHeartbeat()
        ├─ status / active / uptime
        ├─ scriptStatus / scriptError
        ├─ resourceUsage
        └─ accessSummary
    → POST /api/instances/{id}/agent-heartbeat
        → 写 lastActiveAt = NOW(), idleTriggered = false   ← 缺陷在这
```

| # | 缺陷 | 后果 |
|---|---|---|
| **H1** | **心跳无条件刷新 `lastActiveAt`**（`agent-heartbeat/route.ts:42`） | **闲时销毁永远不触发**——心跳本身就是"活跃"的证据，这是个自我否定的循环 |
| **H2** | `active` 字段被计算但后端完全忽略 | 心跳里的活动状态信息浪费 |
| **H3** | `IsIdle()` 在 agent 侧定义了（`manager.go:190`）但**从未被调用** | 死代码 |
| **H4** | `idleMinutes` 配置项存在但从未使用 | 死配置 |
| **H5** | `timer`（ECS AutoReleaseTime）是硬超时，与"闲时"语义混淆 | 两个超时互相打架 |
| **H6** | 前端心跳 `/api/health/{wid}/heartbeat` 需登录 | 用户不开着页面就不算活跃 |
| **H7** | 无"最后一根稻草"机制：若无任何 HTTP 请求/心跳，后端不知道实例是死了还是用户离开了 | 误判 |

### 4.2 正确的探活模型

**核心修正：把"心跳存活"与"用户活跃"彻底分开。**

| 信号 | 含义 | 更新什么 |
|---|---|---|
| **心跳**（agent → 后端，60s） | 实例还活着 | `lastHeartbeatAt`（新字段），**不动 `lastActiveAt`** |
| **用户活动**（agent 侧检测） | 有人在用 | `lastActiveAt`，由心跳**携带**上报 |

### 4.3 agent 侧的活跃检测（关键）

agent 已有 `access.Tracker`，但它只记录**agent 自己 API**（9527 端口）的访问。用户实际访问的是 8080/3000 等业务端口，**Tracker 完全看不到**。

**需要新增：业务端口活跃探测。**

```go
// activity/detector.go
type Detector struct {
    ports     []int           // 要探测的端口
    intervals time.Duration   // 采样间隔（默认 30s）
    lastActive time.Time
    mu        sync.RWMutex
}

// 探测方式：读取该端口的 TCP 连接数 + 进程 IO
func (d *Detector) sample() {
    active := false
    for _, port := range d.ports {
        // 方式 1：当前 ESTABLISHED 连接数 > 0（最可靠）
        if countEstablished(port) > 0 {
            active = true
            break
        }
        // 方式 2：该端口所属进程的 CPU 时间增量 > 阈值
        if processCPUDelta(port) > 0.5 {   // 秒/采样间隔
            active = true
            break
        }
    }
    if active {
        d.mu.Lock()
        d.lastActive = time.Now()
        d.mu.Unlock()
    }
}
```

**`countEstablished`** 用 `ss -tn state established` 或读 `/proc/net/tcp`（不依赖外部命令，推荐后者）：

```go
func countEstablished(port int) int {
    // 读 /proc/net/tcp 和 /proc/net/tcp6，统计 state == 01 (ESTABLISHED)
    // 且 local_port == port 的条目数
    // local 和 remote 都不是 127.0.0.1 更佳（排除本地健康检查干扰）
}
```

**为什么要排除 loopback 连接**：`startup.sh`、健康检查会从 localhost 访问，会误判为活跃。

### 4.4 心跳 payload 扩展

```go
type HeartbeatPayload struct {
    Token            string        `json:"token"`
    PublicIP         string        `json:"publicIp"`          // 新增（兜底 ready 失败）
    Status           string        `json:"status"`
    Active           bool          `json:"active"`            // 语义修正：真实用户活跃
    Uptime           int64         `json:"uptime"`
    LastActiveAt     time.Time     `json:"last_active_at"`    // 新增：agent 侧的活跃时间
    ScriptStatus     string        `json:"script_status"`
    ScriptError      string        `json:"script_error"`
    ResourceUsage    *ResourceUsage `json:"resource_usage"`
    AccessSummary    *AccessSummary `json:"access_summary"`
    CurrentEntrypoint string       `json:"current_entrypoint"` // 新增
}
```

### 4.5 后端处理（修正后的 `agent-heartbeat`）

```typescript
const updateData: Record<string, unknown> = {
  lastHeartbeatAt: new Date(),       // ← 新增字段：证明活着
  // 注意：绝不动 lastActiveAt
};

// H2 修复：真正使用 active / last_active_at
if (body.active === true) {
  updateData.lastActiveAt = body.last_active_at
    ? new Date(body.last_active_at)
    : new Date();
  updateData.idleTriggered = false;   // 重新活跃，清除标记
}

// H7 修复：心跳带回 IP，兜底 agent-ready 失败的情况
if (body.publicIp) {
  updateData.publicIp = body.publicIp;
}

if (body.resource_usage) { /* 同现状 */ }
if (body.access_summary) { updateData.accessSummary = body.access_summary; }
```

**关键**：只有 `active === true` 才刷新 `lastActiveAt`。用户离开后，agent 探测不到连接，`active` 变 false，`lastActiveAt` 停止更新 → 闲时计时开始。

### 4.6 闲时判定与销毁触发

**判定放在哪？** 两个候选：

| 方案 | 位置 | 优点 | 缺点 |
|---|---|---|---|
| **A. agent 侧判定** | agent 检测 `IsIdle()` 后主动上报 `idle: true` | 实时；不依赖后端轮询 | agent 若挂掉就不触发（但有 H1 心跳缺失兜底） |
| **B. 前端触发判定** | 前端打开页面时扫 DB，比较 `lastActiveAt` 与 `idleMinutes` | 不依赖 agent；可审计 | 只在有人打开页面时才生效 |

**采用 B**：serverless 无定时任务，判定放在 `/api/maintenance`，由前端 `load()` 打点触发：

- **扫描**：`RUNNING` 且 `now - lastActiveAt >= idleMinutes` 的实例 → 直接 `stopWorkspace`
- 不需要中间态 `idleTriggered`，扫描 + 释放一趟做完

`src/app/api/cron/idle-release/route.ts` 已删除（Vercel 免费版不支持定时任务）。

### 4.7 ECS AutoReleaseTime 与闲时销毁的关系（H5 修复）

**现状**：`createInstance()` 设了 `autoReleaseTime = now + releaseHours`（`service.ts:163-165`）。这是 ECS 层面的硬删除，**与闲时销毁语义冲突**：

- 若 `releaseHours` 短于用户使用时长 → 用着用着被删
- 若长 → 用户放着不管也会被删（但闲时销毁应该更早触发）

**修正方案**：明确两者分工。

| 机制 | 语义 | 建议配置 |
|---|---|---|
| **闲时销毁**（软） | 用户不活跃 N 分钟后停止 | `idleMinutes`，默认 30 |
| **AutoReleaseTime**（硬） | 安全上限，防泄漏 | `releaseHours`，建议设为**远大于** `idleMinutes`，如 12 小时 |

**即：`releaseHours` 应定位为"最后防线"，而非主要回收手段。** 并且在 UI 上明确文案区分：

> 空闲 30 分钟后自动停止
> 最长运行 12 小时（安全上限）

`settings.defaultReleaseHours` 默认 `0.5`（30 分钟）**过短，与 `defaultIdleMinutes=30` 撞车**，建议改为 `12`。

### 4.8 实例状态与闲时的完整状态图

```
        createInstance()
              │
              ▼
      ┌───────────────┐
      │  PROVISIONING │
      └───────┬───────┘
              ▼
      ┌───────────────┐
      │    BOOTING    │ ← 心跳存活性检测（无心跳 → 超时 FAILED）
      │  current_     │
      │  entrypoint   │
      └───────┬───────┘
              │
      ┌───────┴───────┐
      ▼               ▼
┌───────────┐  ┌───────────┐
│  RUNNING  │  │  FAILED   │ → 销毁
│           │  └───────────┘
└─────┬─────┘
      │
      │  ◄── 活跃检测循环（30s 采样）
      │      lastActiveAt 更新
      │
      ├─ 空闲 > idleMinutes
      │                    │
      │      前端 /api/maintenance 触发
      │                    │
      ▼                              ▼
┌───────────────────────────────────────────┐
│  RELEASING                                │
│  ├─ 执行 onerror? 否 → 执行 stop-hook     │
│  ├─ 打包 /workspace 增量到 OSS            │
│  └─ DeleteInstance                        │
└───────────────────┬───────────────────────┘
                    ▼
            ┌───────────────┐
            │   STOPPED     │
            │ (工作区保留)   │
            └───────────────┘
```

### 4.9 新增字段汇总

```sql
-- instances 探活相关
ALTER TABLE instances ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE instances ADD COLUMN idle_checked_at TIMESTAMPTZ;
ALTER TABLE instances ADD COLUMN debug_hold_until TIMESTAMPTZ;  -- 调试模式豁免期
CREATE INDEX idx_instances_heartbeat ON instances(last_heartbeat_at);
CREATE INDEX idx_instances_idle ON instances(status, last_active_at)
  WHERE status = 'RUNNING';
```

### 4.10 调试模式的闲时豁免

`debug_mode = true` 的工作区：

- 脚本失败 → 不销毁，实例保持 RUNNING，`bootError` 记录失败原因
- 设置 `debug_hold_until = now + 30min`
- 闲时销毁**暂停**，直到 `debug_hold_until` 过期
- UI 显著提示："调试模式：实例不会自动释放，持续计费中"
- 提供"重新执行"按钮 → agent `/command` 的 `retry_script`（已存在，`server.go:252`）
- 需要新增 `run_stage` 动作以支持单入口重跑

---

## 五、后端注入 `entrypoint.sh` 的重写

`entrypoint.sh` 现在只做两件事：拉 agent、启动 agent。工作空间文件的写入交给 agent。

**为什么交给 agent 而不是 entrypoint？**

- `entrypoint.sh` 在 ECS UserData 里，base64 编码后有 16KB 限制（UserData 本身限 16KB base64 前）
- 工作空间可能有 2MB 内容，塞不进 UserData
- agent 拉取更灵活（可重试、可流式）

**新的 `entrypoint.sh`**：

```bash
#!/bin/bash
set -e
INSTANCE_ID={{INSTANCE_ID}}
CALLBACK_URL={{CALLBACK_URL}}
ACCESS_TOKEN={{ACCESS_TOKEN}}

mkdir -p /opt/agent/{scripts,logs} /opt/ws

# 1. 下载 agent（改走 OSS 内网）
echo "[entrypoint] Downloading agent..."
ARCH=$(uname -m); case $ARCH in x86_64) A=amd64;; aarch64) A=arm64;; esac
AGENT_URL="https://{{OSS_BUCKET}}.oss-{{REGION}}-internal.aliyuncs.com/agent/{{AGENT_VERSION}}/agent-linux-${A}"
for i in 1 2 3 4 5; do
  curl -sfL "$AGENT_URL" -o /opt/agent/agent && break
  sleep 5
done
chmod +x /opt/agent/agent

# 2. 写配置
cat > /opt/agent/config.json <<CFG
{
  "instance_id": "${INSTANCE_ID}",
  "backend_url": "${CALLBACK_URL}",
  "backend_token": "${ACCESS_TOKEN}",
  "workspace_root": "/opt/ws",
  "entrypoints": /opt/agent/entrypoints.json,
  "heartbeat_interval": 60,
  "activity_sample_interval": 30,
  "idle_minutes": {{IDLE_MINUTES}},
  "debug_mode": {{DEBUG_MODE}},
  "ports_file": "/opt/agent/ports.json"
}
CFG

# 3. 启动 agent
/opt/agent/agent
```

**关键变化**：
- 从 OSS 内网拉 agent（不再走 Vercel 公网）
- config 增加 `workspace_root` / `entrypoints` / `activity_sample_interval` / `idle_minutes` / `debug_mode` / `ports_file`
- 不再下载 `startup.sh`（工作空间由 agent 拉取）

**agent 启动后流程**：

```
1. 从后端拉工作空间文件 → GET /api/instances/{id}/workspace-files
2. 写入 /opt/ws/**，设置权限
3. 写入入口配置 /opt/agent/entrypoints.json
4. 按序执行 pre / main / post
5. 失败 → onerror → 上报 FAILED
6. 成功 → 读 ports.json → 上报 READY
7. 进入活跃探测循环
```

新增 API：`GET /api/instances/[id]/workspace-files`（token 鉴权，同 `verifyAccessToken`）。

---

## 六、目录树编辑器 UI

### 6.1 布局

```
┌─ 工作空间 ──────────────────────────────────────────────────┐
│ ┌──────────────┬────────────────────────────┬─────────────┐ │
│ │ 文件树        │ 编辑器                      │ 入口配置     │ │
│ │              │                             │             │ │
│ │ ▾ entrypoints│  ┌───────────────────────┐ │ pre.sh      │ │
│ │   pre.sh  ●  │  │ 1 #!/bin/bash         │ │  超时 900s  │ │
│ │   main.sh ●  │  │ 2 set -e              │ │  失败阻断 ✓ │ │
│ │   post.sh    │  │ 3                     │ │             │ │
│ │   onerror.sh │  │ 4 apt-get update -qq  │ │ main.sh     │ │
│ │ ▾ scripts    │  │ 5 apt-get install -y  │ │  超时 900s  │ │
│ │   build.ts   │  │   ...                 │ │  失败阻断 ✓ │ │
│ │ ▾ files      │  │                       │ │             │ │
│ │   nginx.conf │  └───────────────────────┘ │ post.sh     │ │
│ │              │                             │  超时 300s  │ │
│ │ [+ 新建文件] │  语言: Shell ▾   [校验]     │             │ │
│ │ [+ 新建目录] │                             │ ─ 端口 ─    │ │
│ │              │                             │ 8080 http   │ │
│ │              │                             │ [+ 添加]    │ │
│ └──────────────┴────────────────────────────┴─────────────┘ │
│                                            [保存] [试运行]   │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 编辑器能力

| 能力 | 实现 |
|---|---|
| 语法高亮 | CodeMirror 6，按扩展名选语言包（sh / python / js / ts / json / yaml / ini / sql / dockerfile） |
| 行号 / 括号匹配 / 自动缩进 | CodeMirror 内置 |
| 多标签页 | 打开多个文件时顶部标签 |
| 保存 | 单文件保存 + 全部保存（Ctrl+S） |
| 校验 | `.sh` 用 `shellcheck` WASM；`.json`/`.yaml` 用解析器；`.py` 可选 `pyflakes` WASM |
| 代码片段 | 内置片段可插入（如"写 ports.json 的样板"） |
| 变量提示 | 提示 `$WS_ROOT` / `$WS_FILES` / `$WS_EXPOSED_PORTS_FILE` 等平台约定 |

### 6.3 片段（Snippet）在新模型下的定位

v3 的片段概念保留，但**形态改变**：

| 维度 | v3 | v4 |
|---|---|---|
| 载体 | 独立 TEXT 字段 | **写入文件树**（如 `entrypoints/pre.sh` 追加 或 `scripts/install-code-server.sh`） |
| 作用 | 独立执行单元 | **代码模板**，插入到指定文件 |
| 编辑 | 片段自带编辑面板 | 直接在文件树编辑器里编辑（本来就是文件） |

**片段变成"代码片段库"**：点"插入"→ 内容追加/插入到当前编辑的文件光标处。这更自然，也不需要额外的数据结构。

**内置片段库**（作为 `src/lib/snippets/` 常量，提供插入按钮）：

| ID | 名称 | 插入内容要点 |
|---|---|---|
| `install-docker` | 安装 Docker | 阿里云镜像源 + daemon.json |
| `install-node` | 安装 Node.js | npmmirror 二进制 |
| `install-python` | 安装 Python | apt + pypi 清华源 |
| `install-code-server` | 安装 code-server | USTC 镜像 deb |
| `docker-run` | 运行容器 | `docker run -d -p ...` + 写 ports.json |
| `git-clone` | 克隆仓库 | `git clone -b <branch>` |
| `declare-port` | 声明端口 | 写 `$WS_EXPOSED_PORTS_FILE` |
| `wait-for-port` | 等待端口就绪 | 轮询 `nc -z localhost <port>` |
| `health-check` | 健康检查 | `curl -sf localhost:<port>` |

---

## 七、改动清单（完整）

### agent（Go）

| 文件 | 改动 |
|---|---|
| `config/config.go` | 新增 `WorkspaceRoot` / `EntrypointsPath` / `ActivitySampleInterval` / `IdleMinutes` / `DebugMode` / `PortsFile` |
| `fetcher/fetcher.go` | **新建**：从后端拉工作空间文件并落盘 |
| `executor/runner.go` | 重写为 `RunAll(entrypoints)`；新增 `runStage`（进程组 + 超时）、`isBlank`、`ReportStageResults` |
| `activity/detector.go` | **新建**：`countEstablished` / `processCPUDelta` / 活跃采样循环 |
| `heartbeat/manager.go` | 心跳携带 `PublicIP` / `LastActiveAt` / `Active`（真实活跃）/ `CurrentEntrypoint`；启用 `IsIdle` |
| `reporter/reporter.go` | `HeartbeatPayload` / `ReadyPayload` 扩展；`ReportStageResults` |
| `main.go` | 补 `ReportReady()`（**修复 P0**）；改为 `RunAll`；启动活跃探测 |
| `api/server.go` | 新增 `run_stage` 动作 |
| `ports/ports.go` | **新建**：读取/校验 `ports.json` |

### 后端（TS）

| 文件 | 改动 |
|---|---|
| `src/lib/db/schema.ts` | 新增 `workspaceFiles` 表；`workspaces.entrypoints` 等；`instances` 探活字段 |
| `src/app/api/instances/[id]/workspace-files/route.ts` | **新建**：agent 拉取文件（token 鉴权） |
| `src/app/api/workspaces/[id]/files/route.ts` | **新建**：文件 CRUD（用户编辑） |
| `src/app/api/instances/[id]/agent-heartbeat/route.ts` | **重写**：分离心跳与活跃，修复 H1 |
| `src/app/api/instances/[id]/agent-ready/route.ts` | 接收 `ports`，写 `exposedPorts`，同步访问码 |
| `src/app/api/instances/[id]/agent-status/route.ts` | 支持 `stage_results` |
| `src/app/api/instance-scripts/startup/route.ts` | **删除**（工作空间由 agent 拉取） |
| `src/app/api/cron/idle-release/route.ts` | **删除**（Vercel 免费版不支持定时任务，改由 `/api/maintenance` 前端触发） |
| `src/app/api/maintenance/route.ts` | **新建**：前端触发超时 / 心跳 / 空闲三合一检查 |
| `src/lib/instances/service.ts` | 注入新 config 变量；`releaseHours` 默认值调整 |
| `src/lib/instances/lifecycle.ts` | 增加 `reapStale()`（`lastHeartbeatAt` 超 3 分钟 → FAILED）+ `releaseIdle()` |
| `src/lib/snippets/` | **新建**：代码片段库 |

### 脚本

| 文件 | 改动 |
|---|---|
| `scripts/entrypoint.sh` | 重写：OSS 拉 agent + 新 config（不再拉 startup.sh） |
| `scripts/startup.sh` | **删除**（逻辑全部移到工作空间 + agent） |
| `scripts/publish-agent.sh` | **新建**：构建并上传 agent 到 OSS |

### 前端

| 文件 | 改动 |
|---|---|
| `src/components/workspaces/workspace-editor.tsx` | **新建**：三栏目录树编辑器 |
| 工作区详情页 | 入口配置 + 端口声明 + 跳转编辑器 |
| 实例详情页 | 替换 `BOOT_PHASES`；展示 `stage_results` |
| 访问页 | 多端口入口展示 |
| 新建工作区向导 | 模板 → 生成初始文件树 → 进入编辑器 |

---

## 八、实施顺序（修订）

| 阶段 | 内容 | 优先级 |
|---|---|---|
| **P1** | 修 `ReportReady` P0 缺陷 + 心跳分离（H1/H2/H7） | **P0** |
| **P2** | 工作空间文件表 + agent fetcher + 落盘 | **P0** |
| **P3** | `RunAll` 逐入口执行（进程组超时 + 空脚本跳过 + 退出码语义） | **P0** |
| **P4** | ports.json 契约 + `exposedPorts` + 多入口展示 | **P0** |
| **P5** | 活跃探测（`activity/detector.go`）+ 闲时销毁闭环 | **P1** |
| **P6** | 心跳缺失检测（`lifecycle.ts`）+ `AutoReleaseTime` 语义修正 | **P1** |
| **P7** | 目录树编辑器 UI | **P1** |
| **P8** | 模板 → 初始文件树生成 | **P1** |
| **P9** | 代码片段库 | **P2** |
| **P10** | agent 二进制走 OSS | **P2** |
| **P11** | 调试模式 | **P3** |

---

## 九、待确认

| # | 问题 | 影响 |
|---|---|---|
| D1 | **入口路径是否允许用户改**（如 `pre` 指向 `scripts/setup.py`）？若允许，用户需自己在脚本里加 shebang 和 chmod | 决定 `EntrypointConfig.path` 是否可编辑 |
| D2 | 入口超时默认值（pre/main 900s）是否合适？ | 用户体验 |
| D3 | 文件限制（单文件 128KB / 200 个 / 2MB）是否够？ | 扩容成本 |
| D4 | 活跃检测的"连接数"方案是否够准？是否需要补充"进程 CPU 增量"作为第二信号？ | 误判风险 |
| D5 | `idle_action` 默认是 `stop`（保留工作区）还是 `destroy`？ | 数据安全 |
| D6 | 是否需要在实例上预装 `python3` / `node`？若不预装，用户 `pre.sh` 里要自己装（首次启动会慢） | 启动耗时 vs 环境完整度 |
| D7 | 编辑器是否要支持上传文件（拖拽一个 zip 解压到工作空间）？ | 实现复杂度 |
