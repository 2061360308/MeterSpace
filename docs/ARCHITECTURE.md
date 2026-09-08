# MeterSpace 架构方案

## 一、资源模型

### 1.1 资源分层

| 层 | 定位 | 来源 | 存储 |
|---|------|------|------|
| **镜像** | 基础环境，可缓存到用户 ACR 秒拉 | Docker Hub / GHCR / 用户 ACR | 外部 registry |
| **Feature** | 工具安装，引用 DevContainer 生态 | ghcr.io/devcontainers/features | 外部 registry |
| **脚本** | 用户自定义操作 | 用户编写 | DB |

### 1.2 资源管理

```
市场（Market）
├─ 来源：你的 registry 仓库（外部生态）
├─ 展示：镜像元数据、Feature 列表
└─ 动作：安装 → 加入"我的资源"

我的资源（My Resources）
├─ 我的镜像：从市场安装 or 自己填 URI
├─ 我的 Features：从市场安装 or 自己粘贴 URI
└─ 我的脚本：只能自己写

创建工作区
└─ 选择：只能从"我的资源"中选
```

### 1.3 数据库设计

```sql
-- 我的镜像
CREATE TABLE user_images (
  id           uuid PRIMARY KEY,
  user_id      text NOT NULL,
  name         text NOT NULL,
  description  text,
  image_uri    text NOT NULL,
  architecture text DEFAULT 'amd64',
  source       text,              -- "marketplace" | "custom"
  marketplace_id text,
  created_at   timestamp DEFAULT now()
);

-- 我的 Features
CREATE TABLE user_features (
  id             uuid PRIMARY KEY,
  user_id        text NOT NULL,
  name           text NOT NULL,
  description    text,
  feature_uri    text NOT NULL,
  options        jsonb DEFAULT '{}',
  source         text,
  marketplace_id text,
  created_at     timestamp DEFAULT now()
);

-- 我的脚本
CREATE TABLE user_scripts (
  id          uuid PRIMARY KEY,
  user_id     text NOT NULL,
  name        text NOT NULL,
  description text,
  script      text NOT NULL,
  sort_order  integer DEFAULT 0,
  enabled     boolean DEFAULT true,
  created_at  timestamp DEFAULT now()
);
```

## 二、侧边栏结构

```
概览                          /
工作区                        /workspaces
弹性规格                      /cloud-instances
  ├─ 阿里云                   /cloud-instances?provider=aliyun
  ├─ 腾讯云                   /cloud-instances?provider=tencent
  └─ AWS                      /cloud-instances?provider=aws
镜像
  ├─ 镜像市场                 /marketplace/images
  └─ 我的镜像                 /my-resources/images
开发环境
  ├─ Feature 市场             /marketplace/features
  └─ 我的 Features            /my-resources/features
脚本                          /my-resources/scripts
设置
  ├─ 通用                     /settings
  ├─ 密钥管理                 /settings/keys
  ├─ 环境变量                 /settings/env
  └─ 持久化目录               /settings/storage
```

## 三、工作区创建流程

### 3.1 新流程

```
Step 1: 基础配置
├─ 工作区名称
└─ 地域

Step 2: 选择仓库
├─ Git 仓库地址 + 分支
└─ 检测 .devcontainer/devcontainer.json

Step 3: 环境配置
├─ 有 devcontainer.json → 解析预览，允许修改
├─ 没有 → 引导创建
│   ├─ 选择镜像（从"我的镜像"中选）
│   ├─ 选择 Features（从"我的 Features"中选）
│   └─ 选择脚本（从"我的脚本"中选）
├─ 环境变量（可选）
└─ 端口转发（可选）

Step 4: 确认创建
└─ 显示配置摘要
```

### 3.2 启动时绑定

```
点击启动 → 选 ECS 规格 → 创建 ECS → 拉镜像 → 装 Features → 执行脚本 → 就绪
```

### 3.3 工作区配置项

| 配置 | 级别 | 说明 |
|------|------|------|
| 地域 | 全局默认 / 工作区覆盖 | |
| 磁盘大小 | 全局默认 / 工作区覆盖 | |
| 带宽 | 全局默认 / 工作区覆盖 | |
| idle 超时 | 全局默认 / 工作区覆盖 | 唯一超时配置，不活跃自动关闭 |
| 环境变量 | 工作区 | |
| 端口转发 | 工作区 | |

## 四、Agent 启动策略

### 4.1 日志上报流程

```
脚本输出 stdout/stderr
  ↓
executor.addLog() → logCh channel
  ↓
main.go goroutine → reporter.SendLog()
  ↓
reporter.logStreamLoop() 缓冲（1秒/10条）
  ↓
POST /api/instances/{id}/agent-logs
  ↓
前端 SSE 实时消费
```

### 4.2 启动阶段策略

| 阶段 | 发送频率 | 原因 |
|------|---------|------|
| 脚本执行中 | 每秒或每 10 条 | 用户需要实时看到进度 |
| 脚本完成 | 发送剩余 + 停止 | 不再有新日志 |
| 运行中 | 按需（API 查询） | 日志已存储在 DB |

### 4.3 状态上报

| 时机 | 行为 | 后端端点 |
|------|------|---------|
| 执行过程中 | 实时发送日志 | `/agent-logs` |
| 脚本完成时 | 发送最终状态 | `/agent-status` (phase="done") |
| 脚本失败时 | 发送错误 | `/agent-error` |

## 五、Registry 仓库设计

```
workspace-cloud-registry/
├── images/                    # 镜像元数据
│   ├── node-22.json          # {"uri": "docker.io/library/node:22", ...}
│   └── fullstack.json
├── features/                  # Feature 引用
│   ├── node.json             # {"uri": "ghcr.io/devcontainers/features/node:1", ...}
│   └── python.json
└── scripts/                   # 脚本模板（供参考）
    ├── setup-git/
    │   ├── meta.json
    │   └── install.sh
    └── ...

.github/workflows/
└── build-index.yml           # 生成 marketplace-index.json
```

## 六、实现任务清单

| 优先级 | 任务 | 涉及文件 |
|--------|------|---------|
| **P0** | 修复自定义脚本端到端链路 | `service.ts`, 前端脚本管理页面 |
| **P0** | 重构新建工作区向导 | `new-workspace-form.tsx`, 步骤组件 |
| **P1** | 数据库表重构 | `schema.ts`, 迁移脚本 |
| **P1** | 侧边栏更新 | `app-sidebar.tsx` |
| **P1** | 市场页面（镜像/Feature） | 新建页面组件 |
| **P1** | 我的资源页面 | 新建页面组件 |
| **P1** | 设置页面补充（环境变量、持久化目录） | `settings-form.tsx` |
| **P2** | Registry 仓库结构 + build-index Action | 外部仓库 |
| **P2** | MarketplaceClient 拉取索引 | 新建 service |
| **P2** | devcontainer.json 解析集成 | 新建 parser |

## 七、关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 资源分层 | 三层模型 | 镜像=基础环境，Feature=工具，脚本=自定义 |
| 侧边栏 | 按资源类型分组 | 用户按类型思考，找资源更直观 |
| 脚本市场 | 无 | 脚本是用户个性化操作，没有共享价值 |
| 工作区流程 | 先选仓库，再配环境 | 仓库可能已有 devcontainer.json |
| 超时配置 | 统一为 idle 超时 | 简化配置，不活跃自动关闭 |
| 镜像同步 | 用户自建 | 不自动同步，高级用户自己管理 |
| ECS 规格 | 启动时绑定 | 不在创建时预设 |
| DevContainer | 借鉴规范，自定义格式 | 支持解析 devcontainer.json，但市场用自有格式 |
