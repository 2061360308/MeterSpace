# Instance 实例系统实现计划

## 一、概念模型

工作区 (Workspace) 与实例 (Instance) 分离：
- **工作区**：固定配置（镜像、features、git、区域、规格）
- **实例**：每次启动创建，包含运行时数据（diskSize、bandwidth、状态、日志、IP）

```
工作区 (Workspace) ──1:N──→ 实例 (Instance)
   │                           │
   │ 固定配置                   │ 每次启动创建
   │ - 镜像、features、git      │ - 弹性资源（diskSize, bandwidth）
   │ - 区域、规格               │ - 启动日志
   │ - OSS 路径                │ - 运行时状态
   │                           │ - 公网 IP、端口
```

## 二、Instance 状态机

```
                         startInstance()
                              │
                              ▼
                    ┌─────────────────┐
                    │  PROVISIONING   │ ← 申请 ECS 资源
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                             ▼
     ECS 创建成功                    ECS 创建失败
              │                             │
              ▼                             ▼
     ┌─────────────────┐           ┌─────────────────┐
     │    BOOTING      │           │     FAILED      │
     │  (环境准备中)    │           │  (可重试)        │
     └────────┬────────┘           └─────────────────┘
              │
    ┌─────────┼─────────┐
    ▼                   ▼
Agent READY         Agent ERROR
    │                   │
    ▼                   ▼
┌───────────┐    ┌─────────────────┐
│  RUNNING  │    │     FAILED      │
│ (可接入)   │    │                 │
└─────┬─────┘    └─────────────────┘
      │
      ├─ 用户停止 ──────────────┐
      ├─ 空闲超时 ──────────────┤
      └─ 自动释放 ──────────────┘
                               │
                               ▼
                    ┌─────────────────┐
                    │   RELEASING     │ ← 持久化数据
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    STOPPED      │
                    └─────────────────┘
```

| 状态 | 含义 | 进入条件 | 退出条件 |
|------|------|---------|---------|
| `PROVISIONING` | 申请 ECS 资源中 | 用户点击启动 | ECS 创建成功 → BOOTING；失败 → FAILED |
| `BOOTING` | 环境准备中 | ECS 实例启动 | Agent 报告 READY → RUNNING；出错 → FAILED |
| `RUNNING` | 运行中，用户可接入 | Agent 就绪 | 用户停止/空闲/释放 → RELEASING |
| `RELEASING` | 持久化数据中 | 收到停止信号 | 持久化完成 → STOPPED |
| `STOPPED` | 已停止 | RELEASING 完成 | 可重新启动 |
| `FAILED` | 启动失败 | PROVISIONING/BOOTING 出错 | 可重试 |

## 三、数据库 Schema 变更

### 3.1 新建 `instances` 表

```sql
CREATE TABLE instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- 启动配置（从工作区默认值继承，可覆盖）
  disk_size INTEGER NOT NULL DEFAULT 40,
  bandwidth INTEGER NOT NULL DEFAULT 10,
  
  -- 运行时状态
  status TEXT NOT NULL DEFAULT 'PROVISIONING',
  ecs_instance_id TEXT,
  public_ip TEXT,
  port INTEGER,
  
  -- 启动验证
  boot_token TEXT,  -- 仅启动时使用，健康回调后清除
  
  -- 启动阶段追踪
  boot_phase TEXT,
  boot_started_at TIMESTAMPTZ,
  boot_completed_at TIMESTAMPTZ,
  boot_error TEXT,
  
  -- 运行时
  last_active_at TIMESTAMPTZ,
  idle_triggered BOOLEAN DEFAULT FALSE,
  
  -- 停止时
  oss_usage_bytes BIGINT,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,
  
  -- 日志清理
  logs_expire_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 新建 `instance_logs` 表

```sql
CREATE TABLE instance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL,       -- info | warn | error
  phase TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instance_logs_instance_id ON instance_logs(instance_id, timestamp);
```

### 3.3 新建 `instance_scripts` 表（用户自定义脚本）

```sql
CREATE TABLE instance_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  script TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 新建 `instance_access_codes` 表

```sql
CREATE TABLE instance_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  
  -- 码信息
  code TEXT NOT NULL UNIQUE,
  is_personal BOOLEAN DEFAULT FALSE,
  
  -- 权限
  allowed_ports INTEGER[] DEFAULT '{8080}',
  
  -- 约束（仅邀请码有效）
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  
  -- 元数据
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(instance_id, code)
);

CREATE INDEX idx_access_codes_instance ON instance_access_codes(instance_id);
CREATE INDEX idx_access_codes_code ON instance_access_codes(code);
```

### 3.5 修改 `settings` 表

```sql
ALTER TABLE settings ADD COLUMN log_retention_days INTEGER DEFAULT 7;
ALTER TABLE settings ADD COLUMN github_mirror TEXT;
ALTER TABLE settings ADD COLUMN docker_mirror TEXT;
```

### 3.6 修改 `workspaces` 表

```sql
-- 移除 diskCategory（硬编码为 cloud_essd）
ALTER TABLE workspaces DROP COLUMN disk_category;
```

### 3.7 删除 `workspaceStates` 表

所有运行时数据迁移到 `instances` 表后删除。

## 四、访问控制设计

### 核心模型

- 每个实例有一个**个人访问码**（永久有效，Owner 使用）
- Owner 可创建多个**邀请码**（带过期时间、次数、端口权限限制）
- 所有访问都通过码提交 → 后端验证 → 开放对应端口

### 访问流程

**流程 1: 用户通过个人码访问**
1. 打开 /instances/[id]
2. 页面显示个人码
3. 用户点击"进入 IDE"
4. 前端调用 POST /api/access { code: "personal_xxx" }
5. 后端验证: 是个人码 → 全部端口权限
6. 后端通过 agent 开放所有端口
7. 返回 { instance_ip, ports, token }
8. 前端跳转到 IDE

**流程 2: 被邀请者通过邀请码访问**
1. 收到邀请链接: https://xxx/instances/[id]?code=invite_xxx
2. 打开链接，前端自动提交 code
3. 前端调用 POST /api/access { code: "invite_xxx" }
4. 后端验证: 是邀请码 → 检查过期/次数 → 限定端口权限
5. 后端通过 agent 仅开放指定端口
6. 返回 { instance_ip, ports (仅允许的), token }
7. 前端跳转到对应服务

### API 设计

**码管理**：
| 方法 | 路径 | 认证 | 用途 |
|------|------|------|------|
| `GET` | `/api/instances/[id]/codes` | Session | 获取所有码 |
| `POST` | `/api/instances/[id]/codes` | Session | 创建邀请码 |
| `DELETE` | `/api/instances/[id]/codes/[codeId]` | Session | 撤销邀请码 |

**访问验证**：
| 方法 | 路径 | 认证 | 用途 |
|------|------|------|------|
| `POST` | `/api/access` | 无（公开） | 提交码获取访问权限 |

## 五、API 设计汇总

| 方法 | 路径 | 认证 | 用途 |
|------|------|------|------|
| `POST` | `/api/workspaces/[id]/instances` | Session | 创建实例 |
| `GET` | `/api/workspaces/[id]/instances` | Session | 实例列表 |
| `GET` | `/api/instances/[id]` | Session | 实例详情 |
| `POST` | `/api/instances/[id]/stop` | Session | 停止实例 |
| `GET` | `/api/instances/[id]/logs/stream` | Session | SSE 日志流 |
| `GET` | `/api/instances/[id]/codes` | Session | 获取所有码 |
| `POST` | `/api/instances/[id]/codes` | Session | 创建邀请码 |
| `DELETE` | `/api/instances/[id]/codes/[codeId]` | Session | 撤销邀请码 |
| `POST` | `/api/access` | 无（公开） | 提交码获取访问 |
| `POST` | `/api/instances/[id]/agent-ready` | boot_token | Agent 就绪 |
| `POST` | `/api/instances/[id]/agent-logs` | boot_token | Agent 日志 |
| `POST` | `/api/instances/[id]/agent-status` | boot_token | Agent 状态 |
| `POST` | `/api/instances/[id]/agent-error` | boot_token | Agent 错误 |
| `POST` | `/api/instances/[id]/agent-heartbeat` | boot_token | Agent 心跳 |

## 六、前端路由

- `/workspaces/[id]` — 工作区详情页（显示当前实例 + 历史实例 + 自定义脚本）
- `/instances/[instanceId]` — 实例详情页（日志 + 进度 + 邀请码管理）

## 七、实施顺序

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | DB Schema (instances, instance_logs, instance_scripts, instance_access_codes, settings 扩展) | 0.5天 |
| Phase 2 | 后端 Instance CRUD API + 停止流程 | 1天 |
| Phase 3 | 后端 Agent API (6个端点) + SSE 日志流 | 1天 |
| Phase 4 | UserData 重写 + Agent 执行流程 | 1天 |
| Phase 5 | 前端：工作区详情页重构 + 实例详情页 | 1.5天 |
| Phase 6 | 自定义脚本 CRUD | 0.5天 |
| Phase 7 | 访问码系统 (个人码 + 邀请码) | 1天 |
| Phase 8 | 日志清理 Cron + 系统设置扩展 | 0.5天 |

## 八、需要清理的旧代码

| 文件 | 变更 |
|------|------|
| `src/lib/db/schema.ts` | 删除 `workspaceStates` 表，修改 `workspaces` 表 |
| `src/lib/workspaces/service.ts` | 重写 `startWorkspace` → `startInstance` |
| `src/lib/userdata.ts` | 完全重写 |
| `src/app/api/workspaces/[id]/start/` | 改为 `POST /api/workspaces/[id]/instances` |
| `src/app/api/workspaces/[id]/stop/` | 改为 `POST /api/instances/[id]/stop` |
| `src/app/api/workspaces/[id]/renew/` | 改为 `POST /api/instances/[id]/renew` |
| `src/app/api/health/[workspaceId]/` | 保留健康回调，新增 Agent API |
| `src/components/workspaces/workspace-detail.tsx` | 重构为显示实例列表 |
| `src/components/workspaces/workspace-list.tsx` | 移除运行时状态显示 |
