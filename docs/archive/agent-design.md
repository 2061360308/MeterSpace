# ECS Instance Agent 设计方案

> 版本：v1.0
> 日期：2026-09-08
> 状态：设计阶段

---

## 一、需求概述

### 1.1 目标

设计一个运行在 ECS 实例上的 Agent 程序，负责：
1. 执行启动脚本并监控状态
2. 向后端上报心跳和状态
3. 采集并上报脚本执行日志
4. 接收后端指令进行回收准备
5. 追踪访问来源 IP 用于安全审计

### 1.2 设计原则

- **安全优先**：Agent 只执行预定义操作，不允许任意脚本执行
- **轻量高效**：单二进制部署，资源占用最小
- **可观测**：完整的心跳、日志、状态上报
- **向后兼容**：不影响现有架构，可渐进式迁移

---

## 二、技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| **语言** | Go | 编译后单二进制、体积小（~10MB）、性能高、无运行时依赖 |
| **通信** | HTTP API 双向调用 | 简单可靠，与现有架构一致 |
| **认证** | Token + HMAC 签名 | 安全且无需复杂 PKI |
| **部署** | systemd 服务 | 可靠的进程管理，支持自动重启 |

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Program (Go Binary, PID 1)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ HeartbeatManager │  │   TaskExecutor   │                    │
│  │  - 60s 心跳上报  │  │  - 启动脚本执行  │                    │
│  │  - 活动检测      │  │  - 日志采集      │                    │
│  │  - 空闲超时计时  │  │  - 失败上报      │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │    APIServer     │  │     Logger       │                    │
│  │  - /health       │  │  - 文件写入      │                    │
│  │  - /status       │  │  - 轮转清理      │                    │
│  │  - /logs         │  │  - 内存缓冲      │                    │
│  │  - /command      │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ AccessTracker    │  │    Config        │                    │
│  │  - IP 记录       │  │  - 环境变量解析  │                    │
│  │  - 可疑检测      │  │  - Token 管理    │                    │
│  │  - 来源汇总      │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块

#### HeartbeatManager（心跳管理器）

**职责**：定期向后端发送心跳，证明实例存活

**设计要点**：
- 心跳间隔：60秒 + 随机延迟 5-15秒（防止惊群效应）
- 携带信息：状态、资源使用、访问来源汇总
- 活动检测：监控用户活动，重置空闲计时器

**心跳 Payload 结构**：

```json
{
  "workspace_id": "ws-xxx",
  "instance_id": "i-xxx",
  "status": "ready",
  "active": true,
  "uptime": 3600,
  "last_active_at": "2026-09-08T10:29:55Z",
  
  "script_status": "success",
  "script_error": null,
  
  "resource_usage": {
    "cpu_percent": 15.2,
    "memory_mb": 512,
    "disk_mb": 10240
  },
  
  "access_summary": {
    "total_unique_ips": 5,
    "recent_access": [
      {
        "ip": "10.0.0.1",
        "last_access_at": "2026-09-08T10:29:55Z",
        "access_count": 120,
        "user_agent": "Mozilla/5.0...",
        "is_backend_ip": true
      }
    ],
    "suspicious_ips": ["10.0.0.5"],
    "unknown_ip_count": 1
  },
  
  "metadata": {
    "ide_connected": true,
    "terminal_count": 3,
    "git_dirty": false,
    "agent_version": "1.0.0"
  }
}
```

#### TaskExecutor（任务执行器）

**职责**：执行启动脚本，采集日志，处理失败重试

**执行流程**：

```
Agent 启动
  ↓
读取 /opt/agent/scripts/startup.sh
  ↓
┌─→ 执行脚本 ──→ 实时采集日志 ──→ 缓冲日志
│     ↓                            ↓
│   成功？──是──→ 标记 READY ──→ 上报就绪
│     │                           │
│     否                          ↓
│     ↓                    定期批量上报日志
│   标记 FAILED
│     ↓
│   上报错误 → 等待重试指令
└─────┘
```

**日志采集**：
- 实时捕获 stdout/stderr
- 内存缓冲 + 定期刷写到文件
- 批量上报给后端（30秒间隔或达到阈值）

#### APIServer（API 服务器）

**职责**：提供 HTTP API 供后端调用

**端点列表**：

| 端点 | 方法 | 功能 | 认证要求 |
|------|------|------|---------|
| `GET /health` | GET | Agent 健康检查 | 无 |
| `GET /status` | GET | 获取详细状态 | Token + HMAC |
| `GET /logs` | GET | 获取脚本日志 | Token + HMAC |
| `POST /command` | POST | 执行预定义指令 | Token + HMAC + IP |

**预定义指令**：

```go
type AgentAction string

const (
    ActionRetryScript    AgentAction = "retry_script"    // 重新执行启动脚本
    ActionPrepareReclaim AgentAction = "prepare_reclaim" // 准备回收（清理临时文件）
    ActionForceStop      AgentAction = "force_stop"      // 强制停止
)
```

#### AccessTracker（访问来源追踪器）

**职责**：记录近期访问来源 IP，检测可疑活动

**数据结构**：

```go
type AccessTracker struct {
    mu           sync.RWMutex
    recentAccess map[string]time.Time  // IP -> 最近访问时间
    accessCount  map[string]int        // IP -> 访问次数
    windowSize   time.Duration         // 追踪窗口（默认30分钟）
}

type AccessRecord struct {
    IP            string    `json:"ip"`
    LastAccessAt  time.Time `json:"last_access_at"`
    AccessCount   int       `json:"access_count"`
    UserAgent     string    `json:"user_agent"`
    IsBackendIP   bool      `json:"is_backend_ip"`
}
```

**威胁检测**：

| 检测项 | 阈值 | 处理 |
|-------|------|------|
| 非白名单 IP 访问 | - | 记录到 suspicious_ips |
| 单 IP 高频访问 | 100次/分钟 | 标记为可疑 |
| 异常 User-Agent | 攻击工具特征 | 标记为可疑 |

---

## 四、API 接口设计

### 4.1 Agent 对外暴露（后端调用）

#### GET /health

健康检查端点，无需认证。

**响应**：

```json
{
  "status": "healthy",
  "agent_version": "1.0.0",
  "uptime": 3600,
  "script_status": "success"
}
```

#### GET /status

获取详细状态信息。

**认证**：Token + HMAC 签名

**响应**：

```json
{
  "workspace_id": "ws-xxx",
  "instance_id": "i-xxx",
  "status": "ready",
  "script_status": "success",
  "uptime": 3600,
  "resource_usage": {
    "cpu_percent": 15.2,
    "memory_mb": 512,
    "disk_mb": 10240
  },
  "access_summary": {
    "total_unique_ips": 5,
    "recent_access": [...],
    "suspicious_ips": [...]
  }
}
```

#### GET /logs

获取脚本执行日志。

**认证**：Token + HMAC 签名

**参数**：
- `offset`：日志偏移量（可选）
- `limit`：返回条数（可选，默认100）

**响应**：

```json
{
  "logs": [
    {
      "timestamp": "2026-09-08T10:00:00Z",
      "level": "info",
      "message": "[step 1/12] Installing dependencies..."
    }
  ],
  "total": 150,
  "has_more": true
}
```

#### POST /command

执行预定义指令。

**认证**：Token + HMAC 签名 + IP 白名单

**请求体**：

```json
{
  "action": "retry_script",
  "timestamp": 1694179200,
  "signature": "hmac-sha256签名"
}
```

**签名算法**：

```
signature = HMAC-SHA256(
  key = TOKEN,
  message = "{workspace_id}:{action}:{timestamp}"
)
```

**响应**：

```json
{
  "status": "accepted",
  "action": "retry_script",
  "message": "Script execution started"
}
```

### 4.2 Agent 调用后端

#### POST /api/health/{id}/agent-ready

就绪上报，在 Agent 启动完成时调用。

**请求体**：

```json
{
  "agent_token": "xxx",
  "instance_id": "i-xxx",
  "public_ip": "10.0.0.1",
  "agent_version": "1.0.0"
}
```

#### POST /api/health/{id}/agent-heartbeat

心跳上报，每 60 秒调用。

**请求体**：

```json
{
  "agent_token": "xxx",
  "status": "ready",
  "active": true,
  "uptime": 3600,
  "script_status": "success",
  "resource_usage": {...},
  "access_summary": {...}
}
```

#### POST /api/health/{id}/agent-status

状态变更上报。

**请求体**：

```json
{
  "agent_token": "xxx",
  "status": "busy",
  "reason": "executing_script"
}
```

#### POST /api/health/{id}/agent-logs

日志批量上报。

**请求体**：

```json
{
  "agent_token": "xxx",
  "logs": [
    {
      "timestamp": "2026-09-08T10:00:00Z",
      "level": "info",
      "message": "..."
    }
  ]
}
```

#### POST /api/health/{id}/agent-error

错误上报。

**请求体**：

```json
{
  "agent_token": "xxx",
  "error_type": "script_execution_failed",
  "error_message": "Step 5 failed: docker pull timeout",
  "stack_trace": "..."
}
```

---

## 五、安全模型

### 5.1 安全层级

| 层级 | 措施 | 说明 |
|------|------|------|
| **网络层** | VPC 隔离 + 安全组 | 网络隔离，限制入站 |
| **来源层** | IP 白名单 (CIDR) | 限制只有后端 IP 能操作 Agent API |
| **认证层** | Token + HMAC 签名 | 防止 Token 泄露滥用 |
| **时间层** | 时间戳校验 (5min) | 防重放攻击 |
| **应用层** | 预定义操作白名单 | Agent 只允许执行 retry_script、prepare_reclaim、force_stop |
| **监控层** | 访问来源追踪 | 记录所有访问 IP，检测可疑活动 |

### 5.2 IP 白名单配置

```bash
# 环境变量配置
AGENT_ALLOWED_IPS=10.0.0.1,10.0.0.0/24,172.16.0.0/16
```

**验证逻辑**：

```go
func isInAllowedIPs(ip string, allowedIPs []string) bool {
    for _, allowed := range allowedIPs {
        if allowed == ip {
            return true
        }
        // 支持 CIDR 匹配
        if strings.Contains(allowed, "/") {
            _, cidr, _ := net.ParseCIDR(allowed)
            if cidr.Contains(net.ParseIP(ip)) {
                return true
            }
        }
    }
    return false
}
```

### 5.3 HMAC 签名验证

```go
func verifySignature(workspaceID, action, timestamp, signature, token string) bool {
    message := fmt.Sprintf("%s:%s:%s", workspaceID, action, timestamp)
    mac := hmac.New(sha256.New, []byte(token))
    mac.Write([]byte(message))
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(signature), []byte(expected))
}

func isTimestampValid(timestamp string) bool {
    ts, err := strconv.ParseInt(timestamp, 10, 64)
    if err != nil {
        return false
    }
    diff := time.Now().Unix() - ts
    return diff >= -300 && diff <= 300 // 5分钟内有效
}
```

### 5.4 心跳上报 IP 来源追踪

Agent 在心跳中携带近期访问来源，后端可据此：
1. 检测异常访问模式
2. 动态更新 IP 白名单
3. 触发安全告警

---

## 六、数据库 Schema 变更

### 6.1 workspace_states 表新增字段

```sql
ALTER TABLE workspace_states 
ADD COLUMN agent_version TEXT,
ADD COLUMN agent_token TEXT,
ADD COLUMN last_agent_heartbeat TIMESTAMP WITH TIME ZONE,
ADD COLUMN agent_status TEXT,
ADD COLUMN script_status TEXT,
ADD COLUMN script_log_path TEXT;
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `agent_version` | TEXT | Agent 版本号 |
| `agent_token` | TEXT | Agent 专用 Token |
| `last_agent_heartbeat` | TIMESTAMP | Agent 最后心跳时间 |
| `agent_status` | TEXT | Agent 状态 (ready/busy/error) |
| `script_status` | TEXT | 脚本状态 (running/success/failed) |
| `script_log_path` | TEXT | 脚本日志存储路径 |

### 6.2 新增 agent_logs 表（可选）

```sql
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_workspace_id ON agent_logs(workspace_id);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at);
```

---

## 七、与现有架构的集成

### 7.1 修改 src/lib/userdata.ts

在启动脚本中添加 Agent 安装步骤：

```typescript
// 在 buildEntrypoint() 函数中，在步骤 1 之后添加 Agent 安装
const agentBlock = `
# === 1.5 安装 Agent ===
AGENT_VERSION="1.0.0"
curl -sSL "https://oss.xxx.com/agent/\${AGENT_VERSION}/agent-linux-amd64" -o /opt/agent/agent
chmod +x /opt/agent/agent

# 写入 Agent 配置
mkdir -p /opt/agent/config
cat > /opt/agent/config.json << EOF
{
  "workspace_id": "${vars.workspaceId}",
  "backend_url": "${vars.callbackUrl}",
  "token": "${vars.agentToken}",
  "allowed_ips": "${vars.allowedIPs ?? ""}",
  "heartbeat_interval": 60,
  "idle_minutes": ${vars.idleMinutes}
}
EOF

# 启动 Agent
/opt/agent/agent serve &
echo "[agent] Agent started."
`;
```

### 7.2 修改 src/lib/workspaces/service.ts

```typescript
// 在 startWorkspace() 中生成 Agent Token
const agentToken = generateAgentToken();

await db
  .update(workspaceStates)
  .set({ 
    status: "PROVISIONING", 
    accessToken,
    agentToken,  // 新增
    healthCallback: false 
  })
  .where(eq(workspaceStates.workspaceId, workspaceId));

// 在 launchInstance() 中传递 agentToken 到 EntrypointVars
```

### 7.3 新增后端 API

#### /api/health/[id]/agent-heartbeat/route.ts

```typescript
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceStates } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { workspaceId } = await params;
    const body = (await req.json()) as {
      agent_token?: string;
      status?: string;
      active?: boolean;
      uptime?: number;
      script_status?: string;
      resource_usage?: Record<string, number>;
      access_summary?: Record<string, unknown>;
    };

    const state = await db.query.workspaceStates.findFirst({
      where: eq(workspaceStates.workspaceId, workspaceId),
    });
    if (!state) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    // 验证 Agent Token
    if (!body.agent_token || body.agent_token !== state.agentToken) {
      return fail(Object.assign(new Error("Invalid agent token"), { status: 403 }));
    }

    await db
      .update(workspaceStates)
      .set({
        lastAgentHeartbeat: new Date(),
        agentStatus: body.status ?? state.agentStatus,
        scriptStatus: body.script_status ?? state.scriptStatus,
        lastActiveAt: body.active ? new Date() : state.lastActiveAt,
        idleTriggered: false,
        updatedAt: new Date(),
      })
      .where(eq(workspaceStates.workspaceId, workspaceId));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
```

#### /api/health/[id]/agent-logs/route.ts

```typescript
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceStates, agentLogs } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { workspaceId } = await params;
    const body = (await req.json()) as {
      agent_token?: string;
      logs?: Array<{
        timestamp: string;
        level: string;
        message: string;
      }>;
    };

    const state = await db.query.workspaceStates.findFirst({
      where: eq(workspaceStates.workspaceId, workspaceId),
    });
    if (!state) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    if (!body.agent_token || body.agent_token !== state.agentToken) {
      return fail(Object.assign(new Error("Invalid agent token"), { status: 403 }));
    }

    // 批量插入日志
    if (body.logs && body.logs.length > 0) {
      await db.insert(agentLogs).values(
        body.logs.map((log) => ({
          workspaceId,
          level: log.level,
          message: log.message,
          metadata: { timestamp: log.timestamp },
        }))
      );
    }

    return ok({ ok: true, inserted: body.logs?.length ?? 0 });
  } catch (e) {
    return fail(e);
  }
}
```

---

## 八、目录结构

```
src/agent/
├── main.go                      # 入口，启动所有服务
├── go.mod
├── go.sum
│
├── config/
│   └── config.go                # 配置定义
│
├── heartbeat/
│   ├── manager.go               # 心跳管理器
│   ├── activity.go              # 活动检测
│   └── idle.go                  # 空闲判断
│
├── executor/
│   ├── runner.go                # 脚本执行器
│   ├── logger.go                # 日志采集
│   └── retry.go                 # 重试逻辑
│
├── api/
│   ├── server.go                # HTTP 服务器
│   ├── health.go                # /health 端点
│   ├── status.go                # /status 端点
│   ├── logs.go                  # /logs 端点
│   └── command.go               # /command 端点
│
├── reporter/
│   └── reporter.go              # 后端 API 调用封装
│
├── crypto/
│   └── signature.go             # HMAC 签名验证
│
├── access/
│   └── tracker.go               # IP 来源追踪
│
└── pkg/
    ├── process/
    │   └── manager.go           # 子进程管理
    └── resource/
        └── monitor.go           # 资源使用监控
```

---

## 九、配置参数

### 9.1 环境变量

```bash
# 必需
AGENT_WORKSPACE_ID=ws-xxx
AGENT_BACKEND_URL=https://xxx.vercel.app
AGENT_BACKEND_TOKEN=xxx

# 心跳配置
AGENT_HEARTBEAT_INTERVAL=60       # 心跳间隔（秒）
AGENT_HEARTBEAT_JITTER=15         # 随机抖动范围（秒）
AGENT_IDLE_MINUTES=30             # 空闲超时（分钟）

# 脚本配置
AGENT_SCRIPT_PATH=/opt/agent/scripts/startup.sh
AGENT_SCRIPT_TIMEOUT=300          # 脚本执行超时（秒）

# API 配置
AGENT_PORT=9527                   # 监听端口
AGENT_LOG_PATH=/var/log/agent     # 日志目录

# 安全配置
AGENT_ALLOWED_IPS=10.0.0.1,10.0.0.0/24

# 可选
AGENT_ENABLE_RESOURCE_MONITOR=true
AGENT_LOG_UPLOAD_INTERVAL=30      # 日志上报间隔（秒）
```

### 9.2 配置文件

也可以使用配置文件 `/opt/agent/config.json`：

```json
{
  "workspace_id": "ws-xxx",
  "backend_url": "https://xxx.vercel.app",
  "backend_token": "xxx",
  "heartbeat_interval": 60,
  "heartbeat_jitter": 15,
  "idle_minutes": 30,
  "script_path": "/opt/agent/scripts/startup.sh",
  "script_timeout": 300,
  "port": 9527,
  "log_path": "/var/log/agent",
  "allowed_ips": ["10.0.0.1", "10.0.0.0/24"],
  "enable_resource_monitor": true,
  "log_upload_interval": 30
}
```

---

## 十、部署流程

### 10.1 构建 Agent

```bash
# 本地构建
cd src/agent
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o agent-linux-amd64 .

# 交叉编译（可选）
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o agent-linux-arm64 .
```

### 10.2 上传到 OSS

```bash
# 上传到 OSS
ossutil cp agent-linux-amd64 oss://your-bucket/agent/v1.0.0/agent-linux-amd64

# 设置版本号
echo "v1.0.0" > version.txt
ossutil cp version.txt oss://your-bucket/agent/version.txt
```

### 10.3 修改 UserData

在 `src/lib/userdata.ts` 的 `buildEntrypoint()` 中添加 Agent 安装步骤。

### 10.4 部署后端 API

新增以下 API 端点：
- `/api/health/[id]/agent-ready`
- `/api/health/[id]/agent-heartbeat`
- `/api/health/[id]/agent-status`
- `/api/health/[id]/agent-logs`
- `/api/health/[id]/agent-error`

### 10.5 执行数据库迁移

```bash
# 使用 Drizzle 或手动执行 SQL
npm run db:migrate
```

---

## 十一、状态机

### 11.1 Agent 状态

```
                    ┌─────────────┐
                    │  STARTING   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
          ┌─────────│   READY     │─────────┐
          │         └──────┬──────┘         │
          │                │                │
          │                ▼                │
          │         ┌─────────────┐         │
          │         │    BUSY     │         │
          │         └──────┬──────┘         │
          │                │                │
          │                ▼                │
          │         ┌─────────────┐         │
          └─────────│   IDLE      │─────────┘
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   ERROR     │
                    └─────────────┘
```

### 11.2 脚本执行状态

```
                    ┌─────────────┐
                    │  PENDING    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  RUNNING    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ SUCCESS  │ │ FAILED   │ │ TIMEOUT  │
       └──────────┘ └──────────┘ └──────────┘
```

---

## 十二、与现有架构的对比

| 功能 | 现有架构 | Agent 架构 |
|------|---------|-----------|
| **启动脚本执行** | UserData 一次性执行 | Agent 管理，支持重试 |
| **健康上报** | 启动脚本中 curl 回调 | Agent 专用端点 |
| **心跳机制** | 前端 JS 触发（需登录） | Agent 自动上报（独立） |
| **空闲检测** | idle-watcher.sh 脚本 | Agent 内置 |
| **日志采集** | 无 | Agent 实时采集上报 |
| **状态监控** | 被动查询 ECS API | Agent 主动上报 |
| **回收流程** | Cloud Assistant 远程执行 | Agent API + Cloud Assistant |
| **IP 追踪** | 无 | Agent 内置追踪 |

---

## 十三、迁移策略

### 13.1 渐进式迁移

1. **Phase 1**：Agent 作为独立模块，与现有架构并行
2. **Phase 2**：Agent 接管心跳和日志上报
3. **Phase 3**：Agent 接管空闲检测（替代 idle-watcher.sh）
4. **Phase 4**：Agent 接管回收清理（替代 Cloud Assistant stop-hook）

### 13.2 向后兼容

- 保留现有 `/api/health/{id}` 端点
- 保留现有 `/api/health/{id}/idle` 端点
- 保留现有 `/api/health/{id}/heartbeat` 端点（前端心跳）
- Agent 心跳使用新端点，不冲突

### 13.3 回滚方案

如果 Agent 出现问题：
1. 停止 Agent 进程
2. 回退 UserData 脚本（移除 Agent 安装步骤）
3. 启动新实例时自动使用旧架构

---

## 十四、监控指标

### 14.1 Agent 指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| `agent_heartbeat_interval` | 实际心跳间隔 | > 120s |
| `agent_script_duration` | 脚本执行时长 | > 600s |
| `agent_api_latency` | API 响应延迟 | > 1000ms |
| `agent_error_rate` | 错误率 | > 5% |

### 14.2 后端指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| `heartbeat_receive_rate` | 心跳接收率 | < 90% |
| `agent_token_verify_fail_rate` | Token 验证失败率 | > 10% |
| `suspicious_ip_count` | 可疑 IP 数量 | > 10 |

---

## 十五、待办事项

### P0（必须）

- [ ] 数据库 Schema 变更
- [ ] Agent Token 生成与存储
- [ ] Agent 专用心跳端点
- [ ] Agent 状态上报 API

### P1（重要）

- [ ] 日志上报 API
- [ ] IP 白名单配置管理
- [ ] Agent 二进制构建与分发
- [ ] HMAC 签名验证

### P2（可选）

- [ ] Agent 版本管理
- [ ] Agent 进程健康监控
- [ ] 与现有 idle-watcher 迁移
- [ ] 性能优化

---

## 十六、参考资源

1. **Gitpod Supervisor 架构**：https://github.com/gitpod-io/gitpod/tree/main/components/supervisor
2. **GitHub Codespaces 生命周期**：https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle
3. **阿里云 Agent Native Cloud**：https://www.cnblogs.com/alisystemsoftware/p/20107445
4. **HMAC 签名规范**：https://datatracker.ietf.org/doc/html/rfc2104

---

## 十七、变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-09-08 | v1.0 | 初始设计文档 |
