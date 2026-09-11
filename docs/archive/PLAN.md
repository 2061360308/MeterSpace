# Workspace Cloud — 类 Codespaces 云端开发环境完整规划

> 自部署模式：用户填写自己的阿里云 AK，Vercel 部署前端 + Serverless，ECS 按需创建/销毁，ossfs 挂载 workspace 实时落 OSS。

---

## 〇、关键技术与架构决策（实现前必读）

本文档后续所有章节以本节决策为准。这些决策已在需求评审阶段确认，任何实现不得偏离。

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | `/workspace` 持久化挂载 | **ossfs**（阿里云官方 FUSE，OSS 原始对象模型），**非 JuiceFS** | JuiceFS 需常驻元数据引擎（Redis/PG），与「ECS 即用即毁、零常驻」冲突；ossfs 对象=文件，贴合停止只留增量、控制台看文件、按对象算占用等全部设计 |
| D2 | code-server 运行方式 | **Docker 容器**运行（`docker run IMAGE_URI`），`/workspace` 以 volume 挂入容器 | 符合「用户自定义镜像」设计；base OS 镜像只装 docker + ossfs |
| D3 | 停止/快照清理触发 | **阿里云 ECS 云助手 RunCommand** 在机内执行 `stop-hook.sh`，后端轮询 `DescribeInvocationResults` 后 `DeleteInstance` | 无额外端口、无密钥、无 agent，最契合 serverless 后端 |
| D4 | ECS 基础 OS 镜像（ImageId） | `DescribeImages` 动态查询该地域最新 Ubuntu 22.04 公共镜像，结果缓存 | 镜像 ID 随版本迭代变化，映射表会过期 |
| D5 | code-server 密码 & 健康回调鉴权 | 后端每次启动生成 `access_token`，作为 code-server 密码**和**健康回调鉴权凭证统一注入 | 消除「注入后又 openssl 重生成」的矛盾；回调带 token 校验防伪造 |
| D6 | Features 安装位置 | 容器启动后 `docker exec` 在容器内执行 installScript，装到容器内 `/opt/<tool>` | code-server 集成终端运行在容器内，工具必须在容器内可见；随实例不持久化（镜像不固化） |
| D7 | 漫游配置（code-server settings/gitconfig） | 停止时 `docker cp` 打包到 OSS `ws-{id}/config/roaming.tar.gz`，启动时恢复 | 小文件走快照不常驻 FUSE，避免拖慢 IDE |
| D8 | 展示价格口径 | 所有界面显示的价格均为 **DescribePrice 折后价（TradePrice）**；规格卡片显示实例折后单价，价格面板 total = 实例+系统盘折后价之和。文中 mockup 的 ¥ 数字仅示意，以实值为准 | 统一口径避免「原价/折后价」混用 |

---

## 一、项目定位

对标 GitHub Codespaces 的**自部署**云端开发环境服务。

- **用户自填阿里云 AK**：所有资源归属用户自己的账号，无平台托管信任问题
- **工作区 = 配置 + OSS 数据**：创建后一直在，直到手动销毁
- **ECS = 临时工具**：按需创建/销毁，只有「运行中」才存在
- **OSS = 真正的持久层**：同地域内网访问，零流量费，ossfs 挂载后端
- **停止时只保留增量**：已提交到 git 远程的文件不重复存储，只存未提交的 untracked/modified 文件

---

## 二、部署拓扑

```
┌────────────────────────────────  Vercel（全栈 Next.js）  ─────────────────────────────┐
│                                                                                      │
│  前端 UI                                   Serverless API Route                       │
│  ├─ 登录 / 初始化向导                        ├─ POST/GET/DELETE /api/workspaces        │
│  ├─ 工作区列表 + 实时状态                     ├─ GET  /api/workspaces/:id              │
│  ├─ 新建工作区（单页表单）                     ├─ POST /api/workspaces/:id/start        │
│  ├─ 工作区详情（启动/停止/进入）               ├─ POST /api/workspaces/:id/stop         │
│  ├─ 动态价格面板（实时联动）                   ├─ POST /api/workspaces/:id/renew        │
│  ├─ 全局设置（AK/默认参数）                    ├─ DELETE /api/workspaces/:id            │
│  └─ 余额显示 + OSS 空间监控                   ├─ POST /api/price/calculate             │
│                                               ├─ GET  /api/ecs/types                   │
│                                               ├─ GET  /api/ecs/price                   │
│                                               ├─ GET  /api/ecs/spot-advice             │
│                                               ├─ GET  /api/ecs/regions                 │
│                                               ├─ GET  /api/acr/repositories            │
│                                               ├─ GET  /api/git/repos                   │
│                                               ├─ GET  /api/git/branches                │
│                                               ├─ GET  /api/account/balance             │
│                                               ├─ POST /api/health/:id                  │
│                                               └─ POST /api/health/:id/idle             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        │ 阿里云 OpenAPI SDK（HMAC 签名，serverless 兼容）
        ▼
┌─────────────────────────── 阿里云账号（部署者自填 AK）  ──────────────────────────────┐
│                                                                                      │
│  ECS: 按量创建 (PostPaid + AutoReleaseTime + UserData)                               │
│       抢占式可选 (SpotAsPriceGo / SpotWithPriceLimit + SpotDuration=0|1)              │
│       + 云助手 RunCommand 执行停止/快照脚本                                            │
│  ACR: 用户选镜像（含 code-server base / dev-xxx 分层镜像）                             │
│  OSS: workspace 持久化（ossfs 后端，同地域内网）                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| **前端框架** | Next.js 14+ (App Router) | Vercel 原生部署，SSR/SSG/Serverless 一体 |
| **语言** | TypeScript | 全栈类型安全 |
| **样式** | Tailwind CSS + Shadcn/UI | 原子化 CSS + 零运行时预制组件（Radix + CVA） |
| **图表** | Recharts | 轻量 React 原生图表，价格曲线 |
| **后端** | Next.js API Routes (Vercel Serverless) | 无独立后端服务，按需冷启动 |
| **阿里云 SDK** | @alicloud/pop-core | 官方 SDK，覆盖 ECS/ACR/OSS/BSS 全部 API |
| **数据库** | Neon Postgres (Drizzle ORM) | Serverless Postgres，scale-to-zero，Drizzle 极轻量冷启动快 |
| **缓存/心跳** | Upstash Redis (M2+ 可选) | Serverless Redis，TTL 适合 idle 检测 |
| **认证** | NextAuth.js v5 | Credentials 密码登录 + GitHub/CNB OAuth，自托管 |
| **存储** | 阿里云 OSS (ossfs 后端) | 同地域内网，workspace 持久化 |
| **ECS 内文件挂载** | ossfs | 把 OSS 的 `ws-{id}/workspace` 直接挂为 `/workspace` |
| **远程命令** | 云助手 RunCommand | 停止时在 ECS 内执行快照/清理脚本 |
| **镜像** | 阿里云 ACR | 用户自定义镜像仓库 |
| **部署** | Vercel (前端+Serverless) + 阿里云 ECS (工作区) | 前端托管 Vercel，运行时按需创建 ECS |

---

## 四、数据库 Schema

### 4.1 users — 用户表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID PK | 主键，默认 `gen_random_uuid()` |
| `username` | TEXT UNIQUE NOT NULL | 用户名 |
| `password` | TEXT NOT NULL | bcrypt 哈希 |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | 创建时间 |

### 4.2 settings — 全局配置表（每用户一组）

| 字段 | 类型 | 说明 |
|---|---|---|
| `user_id` | UUID PK FK → users | 用户 |
| `ali_access_key_id` | TEXT NOT NULL | AES-256-GCM 加密后的 AK |
| `ali_access_secret` | TEXT NOT NULL | AES-256-GCM 加密后的 SK |
| `default_region` | TEXT DEFAULT 'cn-hangzhou' | 默认地域 |
| `default_spec` | TEXT DEFAULT 'ecs.g6.xlarge' | 默认实例规格 |
| `default_disk_category` | TEXT DEFAULT 'cloud_essd' | 默认磁盘类型 |
| `default_disk_size` | INT DEFAULT 40 | 默认磁盘大小 (GB) |
| `default_bandwidth` | INT DEFAULT 10 | 默认公网带宽 (Mbps) |
| `default_release_hours` | INT DEFAULT 4 | 自动释放默认时长 (小时) |
| `default_idle_minutes` | INT DEFAULT 30 | 空闲休眠默认阈值 (分钟) |
| `default_spot_strategy` | TEXT DEFAULT 'NoSpot' | 默认抢占策略 (NoSpot/SpotAsPriceGo/SpotWithPriceLimit) |
| `default_spot_duration` | INT DEFAULT 1 | 抢占保障时长 (0 或 1) |
| `acr_instance_id` | TEXT | ACR 实例 ID（首次使用某地域时自动创建） |
| `oss_bucket` | TEXT | OSS Bucket 名（首次使用某地域时自动创建） |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | 更新时间 |

### 4.3 workspaces — 工作区表（核心）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID PK | 主键 |
| `user_id` | UUID FK → users | 所属用户 |
| `name` | TEXT NOT NULL | 工作区名称（用户自定义） |
| `region` | TEXT NOT NULL | 地域 |
| `instance_type` | TEXT NOT NULL | 实例规格（如 ecs.g6.xlarge） |
| `disk_category` | TEXT DEFAULT 'cloud_essd' | 磁盘类型 |
| `disk_size` | INT DEFAULT 40 | 磁盘大小 (GB) |
| `bandwidth` | INT DEFAULT 10 | 公网带宽 (Mbps) |
| `public_ip` | BOOLEAN DEFAULT true | 是否分配公网 IP |
| `spot_strategy` | TEXT DEFAULT 'NoSpot' | 抢占策略 |
| `spot_duration` | INT DEFAULT 1 | 抢占保障 (0/1) |
| `spot_price_limit` | DECIMAL(8,4) | 固定上限价（SpotWithPriceLimit 时使用） |
| `image_uri` | TEXT NOT NULL | 完整 Docker 镜像地址 |
| `features` | JSONB DEFAULT '[]' | 选中的 features 数组 `[{id, name, version, installScript}]` |
| `git_provider` | TEXT | git 平台 (github/cnb) |
| `git_repo_url` | TEXT | 仓库 URL |
| `git_branch` | TEXT DEFAULT 'main' | 分支 |
| `git_token_enc` | TEXT | 加密的 OAuth token |
| `auto_clone` | BOOLEAN DEFAULT true | 是否自动拉取代码 |
| `release_hours` | INT | 自动释放时长 (null=用全局默认) |
| `idle_minutes` | INT | 空闲阈值 (null=用全局默认) |
| `oss_workspace_path` | TEXT | OSS 路径 `ws-{id}/workspace` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | 更新时间 |

> **关键设计**：`instance_type` 等规格字段在「精确变配启动」时会被更新，新规格成为下次启动的默认值。

### 4.4 workspace_states — 运行状态表

| 字段 | 类型 | 说明 |
|---|---|---|
| `workspace_id` | UUID PK FK → workspaces | 工作区 |
| `status` | TEXT DEFAULT 'STOPPED' | 状态：STOPPED / PROVISIONING / RUNNING / TERMINATING |
| `instance_id` | TEXT | ECS 实例 ID（运行时有值） |
| `public_ip` | TEXT | 公网 IP |
| `port` | INT | IDE 端口（code-server 默认 8080） |
| `access_token` | TEXT | code-server 密码（每次启动重新生成） |
| `health_callback` | BOOLEAN DEFAULT false | 是否已收到健康回调 |
| `last_active_at` | TIMESTAMPTZ | 最后活跃时间 |
| `idle_triggered` | BOOLEAN DEFAULT false | 是否已触发空闲释放 |
| `oss_usage_bytes` | BIGINT | OSS 空间占用（停止时计算） |
| `released_at` | TIMESTAMPTZ | 最后释放时间 |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | 更新时间 |

### 4.5 audit_logs — 操作日志表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID PK | 主键 |
| `user_id` | UUID FK → users | 用户 |
| `workspace_id` | UUID FK → workspaces | 工作区 |
| `action` | TEXT NOT NULL | CREATE / START / STOP / DELETE / TERMINATE |
| `details` | JSONB | 操作详情（规格、价格、耗时等） |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | 创建时间 |

---

## 五、容器内目录角色规划

> 说明：code-server 运行在 Docker 容器内（D2）。下表「容器内路径」指容器视角；`/workspace` 由宿主机 ossfs 挂载后以 volume 传入容器（D1）。

| 容器内路径 | 角色 | 内容 | 持久化策略 | 对标 |
|---|---|---|---|---|
| `/workspace` | **代码工作区（核心保护区）** | 仓库代码根目录，固定路径，工具按此路径识别项目 | **ossfs 挂载 → OSS**（实时落盘） | CNB `/workspace`；Codespaces `/workspaces` |
| `/workspace/.snapshots` | **快照目录** | 停止时打包的未提交增量 | 随 workspace（OSS），已加入 .gitignore | — |
| `/opt/<tool>` | **软件装载（容器内）** | Features 动态注入的工具（Node/Go/Python…），按工具分子目录 | 随实例（不持久化），`docker exec` 装进容器 | Codespaces features |
| `/usr/local` | **系统级软件（容器内）** | base 镜像预装（code-server、运行时、基础工具） | 不持久化（镜像自带） | 两者一致 |
| `~/.config` / `~/.local/share/code-server` | **用户配置（容器内 coder）** | code-server settings/snippets/keybindings、gitconfig | **漫游快照**：停止时 `docker cp` 打包到 OSS `ws-{id}/config/roaming.tar.gz`，启动时恢复（D7） | CNB Machine settings；Codespaces dotfiles |
| `/mnt/persist` | **通用持久卷（可选）** | 用户自定义持久目录（排除 /workspace 的杂项） | OSS 挂载（ossfs，同 bucket 另一前缀） | — |

### 设计原则

1. `/workspace` **固定单一路径**：与 CNB 一致，工具按归一化路径区分项目，固定路径能共享历史配置、不「串串」
2. **「大文件持久化走挂载，小配置走漫游快照」**：配置类文件数以千计走 FUSE 会拖慢 IDE，回收时打包上传 OSS、重建恢复
3. Features 装到容器内 `/opt/<tool>` 而非系统目录：镜像不固化，实现「同镜像 + 动态组合」

### base 镜像契约（code-server 镜像必须满足）

为保证任意用户自定义镜像可被本平台正确启动，镜像需满足：

1. 监听 **8080** 端口，HTTP 协议
2. 支持通过环境变量 **`PASSWORD`** 设置登录密码（等价于 `code-server --auth password`）
3. 接受 `/workspace` 作为工作目录（启动参数传入）
4. 默认运行用户可读写挂载的 `/workspace`（宿主 ossfs 挂载使用 `-o allow_other -o uid=1000 -o gid=1000` 对齐 coder UID）

官方推荐 base：`codercom/code-server`（或本平台预制的 `code-server-base`、`dev-xxx` 分层镜像）。

---

## 六、OSS 存储目录结构

同地域一个 Bucket（如 `my-dev-workspace-cn-hangzhou`），内部按工作区划分。ossfs 直接映射，OSS 控制台可见原始文件。

```
my-dev-workspace-cn-hangzhou/        ← 1 个地域 1 个 Bucket
│
├── ws-{id}/                         ← 工作区 1
│   ├── workspace/                   ← ossfs 挂载点（运行时 ECS 的 /workspace）
│   │   ├── .git/                    ← 保留（方便 git 操作）
│   │   ├── .snapshots/              ← 停止时打包增量（已加入 .gitignore）
│   │   │   └── 20260905-1430.tar.gz
│   │   ├── src/                     ← 项目代码（运行时）
│   │   └── ...
│   └── config/                      ← 工作区元数据 + 漫游配置
│       ├── workspace.json           ← 元数据（规格快照等，可选）
│       └── roaming.tar.gz           ← code-server settings/gitconfig 漫游包
│
├── ws-{id}/                         ← 工作区 2
│   └── ...
```

**ossfs 挂载映射**（ECS 启动时，两条挂载）：

```
OSS: {bucket}/ws-{id}/workspace/   ──→  ECS: /workspace        （代码工作区，实时落盘）
OSS: {bucket}/ws-{id}/config/      ──→  ECS: /mnt/config       （漫游配置，启动/停止时读写）
```

**首次使用某地域**：初始化向导里自动检查 → 不存在则调 `PutBucket` 创建。

---

## 七、工作区生命周期

### 状态流转

```
              创建工作区
                 │
                 ▼
           ┌─ STOPPED ──────── 启动（RunInstances）─────────┐
           │                                                │
           │                                          PROVISIONING
           │                                                │
           │                                    健康回调（/api/health）
           │                                                │
           │                                                ▼
           │                                           RUNNING
           │                                                │
           │              停止（RunCommand 快照 + DeleteInstance）  │
           └────────────────────────────────────────────────┘
                         │
                   手动删除（清 OSS + DB）
                         │
                         ▼
                    已删除（不可恢复）
```

| 状态 | ECS 实例 | OSS 计费 | 用户能做什么 |
|---|---|---|---|
| **STOPPED** | 不存在 | 仅 OSS 存储费（极低） | 启动 / 删除 |
| **PROVISIONING** | 创建中 | — | 等待 |
| **RUNNING** | 按量付费中 | OSS + ECS（内网零流量） | 进入 IDE / 停止 / 续期 |
| **TERMINATING** | 释放中 | — | 等待 |

---

## 八、创建工作区完整流程

```
用户填完表单 → 点「创建工作区」

前端:
  POST /api/workspaces
  Body: {
    name, region, instanceType, diskCategory, diskSize, bandwidth, publicIp,
    spotStrategy, spotDuration, spotPriceLimit,
    imageUri, features: [...],
    gitProvider, gitRepoUrl, gitBranch, gitTokenEnc, autoClone,
    releaseHours, idleMinutes
  }

后端 (Vercel Serverless):
  ① Neon: INSERT INTO workspaces (...) → 生成 workspace id
  ② Neon: INSERT INTO workspace_states (workspace_id, status='PROVISIONING')
  ③ Neon: INSERT INTO audit_logs (action='CREATE')
  ④ 检查 OSS Bucket 是否存在 → 不存在则 PutBucket（地域维度，一次）
  ⑤ 检查 ACR 实例是否存在 → 不存在则 CreateInstance（地域维度，一次）
  ⑥ 生成 access_token = crypto.randomBytes(16).toString('hex')   ← D5，唯一凭证
  ⑦ 生成 UserData 脚本（base64 编码，注入 access_token 等，见第九章）
  ⑧ 调 RunInstances:
       InstanceChargeType: "PostPaid"
       RegionId: workspace.region
       ImageId: DescribeImages 查到的 Ubuntu 22.04 镜像 ID   ← D4
       InstanceType: workspace.instance_type
       VSwitchId / SecurityGroupId: 见 8.1 ECS 资源配置
       AutoReleaseTime: now + releaseHours (ISO 8601 UTC)
       InternetMaxBandwidthOut: workspace.bandwidth
       UserData: base64(UserData)
       SpotStrategy: workspace.spot_strategy
       SpotDuration: workspace.spot_duration (if spot)
       SpotPriceLimit: workspace.spot_price_limit (if SpotWithPriceLimit)
       Tag.1.Key: "workspace-id", Tag.1.Value: workspace.id
       Tag.2.Key: "managed-by", Tag.2.Value: "workspace-cloud"
  ⑨ Neon: UPDATE workspace_states SET instance_id=..., status='PROVISIONING'
  ⑩ 返回 { workspaceId, status: 'PROVISIONING' }

前端: 显示 "准备中..." → 轮询 /api/workspaces/:id（每 10 秒）
```

### 8.1 ECS 资源配置（每地域首次自动准备）

RunInstances 依赖以下资源，按地域惰性创建/发现并缓存：

| 资源 | 处理方式 |
|---|---|
| **ImageId** | `DescribeImages(RegionId, ImageOwnerAlias='system', OSType='linux', Platform='Ubuntu', Architecture='x86_64')`，取名称含 `22.04` 的最新镜像；结果进程内 + Redis 缓存（D4） |
| **VPC** | `DescribeVpcs` 取默认 VPC；无则 `CreateVpc` |
| **VSwitch** | `DescribeVSwitches` 取默认；无则 `CreateVSwitch`（选可用区） |
| **安全组** | 自动创建安全组，入方向放行 **8080**（code-server）与可选 22（SSH 调试）；出方向全放行。**无需放行其他端口**（停止走云助手，D3） |
| **RAM 角色** | 为 ECS 绑定 `workspace-cloud-ecs-role`，授权 OSS（`oss:GetObject/PutObject/DeleteObject/ListObjects`，限定该 bucket）与 ACR（拉镜像）。ossfs 用 `-o ram_role` 免 AK 落盘 |

---

## 九、ECS 启动自举（UserData 脚本详细逻辑）

> 依据决策 D1（ossfs）、D2（Docker 容器）、D5（access_token 鉴权）、D6（docker exec 装 features）、D7（漫游配置）。以下为完整正确脚本。

```bash
#!/bin/bash
set -e

# === 环境变量（由后端在 UserData 头部注入）===
WORKSPACE_ID="${WORKSPACE_ID}"
OSS_BUCKET="${OSS_BUCKET}"
OSS_WORKSPACE_PATH="${OSS_WORKSPACE_PATH}"      # ws-{id}/workspace
REGION="${REGION}"
IMAGE_URI="${IMAGE_URI}"
RAM_ROLE_NAME="${RAM_ROLE_NAME}"                # workspace-cloud-ecs-role
CALLBACK_URL="${CALLBACK_URL}"                  # Vercel https 地址
ACCESS_TOKEN="${ACCESS_TOKEN}"                  # D5：code-server 密码 + 回调凭证
GIT_REPO_URL="${GIT_REPO_URL:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
GIT_AUTHED_URL="${GIT_AUTHED_URL:-}"            # 后端拼好带 token 的克隆地址注入（不落盘）
GIT_AUTO_CLONE="${GIT_AUTO_CLONE:-true}"
IDLE_MINUTES="${IDLE_MINUTES:-30}"
FEATURES="${FEATURES:-[]}"

# === 1. 基础环境 ===
apt-get update && apt-get install -y docker.io git curl jq tar ossfs rsync

# === 2. 启动 Docker ===
systemctl enable --now docker

# === 3. 登录 ACR（仅当镜像来自阿里云 ACR 时）===
case "${IMAGE_URI}" in
  registry.*.aliyuncs.com/*)
    # 从实例元数据获取 RAM Role 的 STS 临时凭证（不硬编码 AK）
    STS=$(curl -s http://100.100.100.200/latest/meta-data/ram/security-credentials/${RAM_ROLE_NAME})
    AK_ID=$(echo "$STS" | jq -r '.AccessKeyId')
    AK_SECRET=$(echo "$STS" | jq -r '.AccessKeySecret')
    # 个人版 ACR 用 AK/SK 登录；企业版改用 GetAuthorizationToken 的临时 token
    docker login "registry.${REGION}.aliyuncs.com" --username="${AK_ID}" --password="${AK_SECRET}"
    ;;
esac

# === 4. 挂载 /workspace（ossfs，D1）===
mkdir -p /workspace /mnt/config
ossfs "${OSS_BUCKET}:/${OSS_WORKSPACE_PATH}" /workspace \
  -ourl="http://oss-${REGION}-internal.aliyuncs.com" \
  -o ram_role="${RAM_ROLE_NAME}" -o allow_other -o uid=1000 -o gid=1000
ossfs "${OSS_BUCKET}:/ws-${WORKSPACE_ID}/config" /mnt/config \
  -ourl="http://oss-${REGION}-internal.aliyuncs.com" \
  -o ram_role="${RAM_ROLE_NAME}" -o allow_other

# === 5. 启动容器（D2）===
docker pull "${IMAGE_URI}"
docker run -d --name workspace \
  -p 8080:8080 \
  -v /workspace:/workspace \
  -e PASSWORD="${ACCESS_TOKEN}" \
  --restart unless-stopped \
  "${IMAGE_URI}" /workspace

# === 6. 恢复漫游配置（D7）===
if [ -f "/mnt/config/roaming.tar.gz" ]; then
  docker cp /mnt/config/roaming.tar.gz workspace:/tmp/roaming.tar.gz
  docker exec workspace bash -c "tar -xzf /tmp/roaming.tar.gz -C /home/coder && rm /tmp/roaming.tar.gz"
  echo "[roaming] Restored."
fi

# === 7. 恢复快照（未提交增量，位于 /workspace/.snapshots）===
if [ -f "/workspace/.snapshots/latest.tar.gz" ]; then
  echo "[snapshot] Restoring latest snapshot..."
  TMPDIR=$(mktemp -d)
  tar -xzf /workspace/.snapshots/latest.tar.gz -C "$TMPDIR"
  rsync -av --exclude='.git' --exclude='.snapshots' "$TMPDIR/" /workspace/
  rm -rf "$TMPDIR"
  echo "[snapshot] Restore complete."
fi

# === 8. Git Clone / Pull（如果开启且有仓库）===
# GIT_AUTHED_URL 由后端生成 UserData 时拼好并注入（含 token，不落盘不进入进程参数）
if [ -n "${GIT_REPO_URL}" ] && [ "${GIT_AUTO_CLONE}" = "true" ]; then
  echo "[git] Cloning/pulling ${GIT_REPO_URL} (${GIT_BRANCH})..."
  cd /workspace
  if [ -d ".git" ]; then
    git pull origin "${GIT_BRANCH}"
  else
    git clone -b "${GIT_BRANCH}" "${GIT_AUTHED_URL}" .
  fi
  echo "[git] Clone complete."
fi

# === 9. 安装 Features（D6：docker exec 装进容器内 /opt）===
echo "${FEATURES}" | jq -c '.[]' | while read -r feature; do
  FEATURE_ID=$(echo "$feature" | jq -r '.id')
  FEATURE_SCRIPT=$(echo "$feature" | jq -r '.installScript')
  echo "[feature] Installing ${FEATURE_ID}..."
  docker exec workspace bash -lc "${FEATURE_SCRIPT}"
  echo "[feature] ${FEATURE_ID} installed."
done

# === 10. 写并启动 idle-watcher（宿主机，见第十二章）===
cat > /opt/idle-watcher.sh <<'WATCHER'
# 见第十二章 idle-watcher.sh 全文
WATCHER
chmod +x /opt/idle-watcher.sh
nohup bash /opt/idle-watcher.sh >/var/log/idle-watcher.log 2>&1 &

# === 11. 健康上报（D5：带 access_token 鉴权）===
PUBLIC_IP=$(curl -s http://100.100.100.200/latest/meta-data/public-ipv4)
INSTANCE_ID=$(curl -s http://100.100.100.200/latest/meta-data/instance-id)
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080 >/dev/null 2>&1; then
    curl -s -X POST "${CALLBACK_URL}/api/health/${WORKSPACE_ID}" \
      -H "Content-Type: application/json" \
      -d "{\"instanceId\":\"${INSTANCE_ID}\",\"publicIp\":\"${PUBLIC_IP}\",\"port\":8080,\"accessToken\":\"${ACCESS_TOKEN}\"}"
    echo "[health] Reported healthy."
    break
  fi
  sleep 5
done

# === 12. 保持运行 ===
tail -f /dev/null
```

**注**：
- 第 8 步 `AUTHED_URL` 应由后端在生成 UserData 时直接拼好（含 token），而非在 ECS 内用 `sed` 拼接，避免 token 出现在命令历史/进程参数。脚本里改为注入现成的 `GIT_AUTHED_URL` 变量（下表统一）。
- 变量命名统一：`CALLBACK_URL`（无 `Vercel_` 前缀）。

**UserData 注入变量最终清单**：`WORKSPACE_ID`, `OSS_BUCKET`, `OSS_WORKSPACE_PATH`, `REGION`, `IMAGE_URI`, `RAM_ROLE_NAME`, `CALLBACK_URL`, `ACCESS_TOKEN`, `GIT_AUTHED_URL`, `GIT_REPO_URL`, `GIT_BRANCH`, `GIT_AUTO_CLONE`, `IDLE_MINUTES`, `FEATURES`。

---

## 十、停止工作区完整流程（云助手 RunCommand，D3）

```
用户点「停止」或 idle 超时触发

前端:
  POST /api/workspaces/:id/stop

后端 (Vercel Serverless):
  ① 读取 workspace_states.instance_id
  ② Neon: UPDATE workspace_states SET status='TERMINATING'
  ③ Neon: INSERT INTO audit_logs (action='STOP')
  ④ 生成 stop-hook.sh（内容见下），base64 后调:
       RunCommand(RegionId, InstanceId, Type='RunShellScript',
                  Timeout=120, CommandContent=base64(stop-hook.sh))
       → 返回 InvokeId
  ⑤ 轮询 DescribeInvocationResults(InvokeId) 直到 InvocationStatus=Finished
     （最长 120s，超时则跳过清理直接删除，见错误处理）
  ⑥ 解析脚本 stdout 中的 OSS_USAGE=<bytes> → UPDATE workspace_states.oss_usage_bytes
  ⑦ 调 DeleteInstance(InstanceIds=[instance_id], Force=true)
  ⑧ Neon: UPDATE workspace_states SET status='STOPPED', instance_id=NULL,
           public_ip=NULL, port=NULL, access_token=NULL, released_at=NOW()
  ⑨ Neon: INSERT INTO audit_logs (action='TERMINATE')
```

**stop-hook.sh**（在 ECS 内以 root 执行，云助手自动把 stdout 回传）：

```bash
#!/bin/bash
set -e
cd /workspace

# === 1. 打包未提交文件（untracked + modified）===
UNTRACKED=$(git ls-files --others --exclude-standard)
MODIFIED=$(git diff --name-only)
ALL_FILES=$(printf '%s\n%s\n' "$UNTRACKED" "$MODIFIED" | sort -u | grep -v '^$')

if [ -n "$ALL_FILES" ]; then
  SNAP=".snapshots/$(date +%Y%m%d-%H%M).tar.gz"
  mkdir -p .snapshots
  printf '%s\n' "$ALL_FILES" | tar -czf "$SNAP" -T -
  ln -sf "$(basename "$SNAP")" .snapshots/latest.tar.gz
  echo "[snapshot] Packed $(printf '%s\n' "$ALL_FILES" | wc -l) files."
fi

# === 2. 漫游配置打包（D7）===
docker exec workspace bash -c "tar -czf /tmp/roaming.tar.gz -C /home/coder .local/share/code-server .config .gitconfig 2>/dev/null || true"
docker cp workspace:/tmp/roaming.tar.gz /mnt/config/roaming.tar.gz 2>/dev/null || true

# === 3. 删除已跟踪文件（保留 .git 和 .snapshots）===
git ls-files | grep -v '^\.snapshots/' | while read -r f; do rm -f "$f"; done
find . -type d -empty -not -path './.git/*' -not -path './.snapshots/*' -delete 2>/dev/null || true
echo "[cleanup] Tracked files removed."

# === 4. 输出 OSS 占用（后端从 stdout 解析）===
echo "OSS_USAGE=$(du -sb /workspace | cut -f1)"
```

**注**：删除大量已跟踪文件在 ossfs 上等同大量 DeleteObject 请求，内网可接受；文件数极多时可改用 `ossutil rm` 批量删除（优化项）。

---

## 十一、启动工作区流程

### 11.1 快速启动（按量/抢占）

```
用户在工作区详情页（STOPPED 状态）点击「按量启动」或「抢占式启动」

前端:
  POST /api/workspaces/:id/start
  Body: { mode: "quick" }   ← 不传规格/spot 参数，用工作区已保存配置 + 全局默认时限

后端:
  ① Neon: 读取 workspace 配置（规格、镜像、features、Git、时限等）
  ② 验证:
     - 若 spot 模式 → 调 DescribePrice(SpotStrategy=...) 确认可抢占
     - 查余额 ≥ 预估费用
  ③ 生成新 access_token（crypto.randomBytes(16).toString('hex')）
  ④ 生成 UserData（同创建流程，第九章）
  ⑤ 调 RunInstances（workspace 保存的规格 + 全局默认时限）
  ⑥ Neon: workspace_states.status='PROVISIONING', instance_id=新ID, access_token=新token
  ⑦ Neon: audit_logs(action='START')
  ⑧ 健康回调（带 token）→ status='RUNNING'
```

### 11.2 精确变配启动

```
用户点「选择规格后启动」→ 弹出完整规格选择面板

前端:
  POST /api/workspaces/:id/start
  Body: {
    mode: "custom",
    instanceType: "ecs.g7.2xlarge",
    spotStrategy: "NoSpot",
    diskCategory: "cloud_essd",
    diskSize: 40,
    bandwidth: 10
  }

后端:
  ① UPDATE workspaces: instance_type=新规格, disk_category, disk_size, bandwidth
     → 新规格成为下次启动的默认值
  ② 后续同 11.1（RunInstances 使用新规格）
```

### 11.3 续期（renew）

```
POST /api/workspaces/:id/renew
Body: { hours: 1 | 4 | 8 | 24 }

后端:
  ① 调 ModifyInstanceAutoReleaseTime(InstanceId, AutoReleaseTime = now + hours)
  ② audit_logs(action='RENEW')
```

---

## 十二、空闲检测机制

### 容器内 idle-watcher.sh（运行于宿主机，UserData 第 10 步写入）

```bash
#!/bin/bash
# idle-watcher.sh — 检测 code-server 活动，空闲超阈值时上报

WORKSPACE_ID="${WORKSPACE_ID}"
IDLE_MINUTES="${IDLE_MINUTES:-30}"
CALLBACK_URL="${CALLBACK_URL}"
CHECK_INTERVAL=60

touch /tmp/.last_activity

get_last_activity() {
  # 综合判断：8080 连接数 / workspace 文件改动 / 终端进程
  local ws_activity=$(ss -tnp 2>/dev/null | grep -c ':8080' || echo 0)
  local file_activity=$(find /workspace -maxdepth 3 -newer /tmp/.last_activity -type f 2>/dev/null | head -1)
  local term_activity=$(docker exec workspace ps aux 2>/dev/null | grep -cE 'bash|zsh|node' || echo 0)

  if [ "$ws_activity" -gt 0 ] || [ -n "$file_activity" ] || [ "$term_activity" -gt 1 ]; then
    date +%s > /tmp/.last_activity
  fi
  cat /tmp/.last_activity 2>/dev/null || date +%s
}

while true; do
  LAST_ACTIVE=$(get_last_activity)
  NOW=$(date +%s)
  IDLE_SECONDS=$((IDLE_MINUTES * 60))
  IDLE_TIME=$((NOW - LAST_ACTIVE))

  if [ "$IDLE_TIME" -ge "$IDLE_SECONDS" ]; then
    echo "[idle] Workspace idle for ${IDLE_TIME}s (threshold: ${IDLE_SECONDS}s)"
    if [ ! -f "/tmp/.idle_triggered" ]; then
      touch /tmp/.idle_triggered
      curl -s -X POST "${CALLBACK_URL}/api/health/${WORKSPACE_ID}/idle" \
        -H "Content-Type: application/json" \
        -d "{\"idleSeconds\": ${IDLE_TIME}, \"accessToken\": \"${ACCESS_TOKEN}\"}"
      echo "[idle] Reported idle to server."
    fi
  else
    rm -f /tmp/.idle_triggered
  fi
  sleep $CHECK_INTERVAL
done
```

### 后端 idle 处理

```
POST /api/health/:workspaceId/idle

① 校验 accessToken（D5）
② Neon: UPDATE workspace_states SET idle_triggered=true, last_active_at=NOW()
③ 读取 workspace.idle_minutes（null 用全局默认）
④ 直接触发停止流程（复用第十章），或等前端下次打开页面时由 `/api/maintenance` 兜底扫描
```

### 前端心跳

用户在 Dashboard 浏览时（不在 IDE 内），前端定时上报：

```
POST /api/health/:workspaceId/heartbeat
Body: { timestamp: Date.now() }

→ Neon: UPDATE workspace_states SET last_active_at=NOW(), idle_triggered=false
```

---

## 十三、动态价格计算引擎

### 13.1 API 设计

```
POST /api/price/calculate

Request Body:
{
  "region": "cn-hangzhou",
  "instanceType": "ecs.g6.xlarge",
  "spotStrategy": "NoSpot",         // 或 "SpotAsPriceGo" / "SpotWithPriceLimit"
  "spotDuration": 1,                 // 0 或 1（仅 SpotStrategy != NoSpot 时）
  "spotPriceLimit": null,            // 固定上限价（SpotWithPriceLimit 时）
  "diskCategory": "cloud_essd",
  "diskSize": 40,
  "bandwidth": 10,
  "durationHours": 4                 // 预估时长
}

Response:
{
  "hourly": {
    "instance": 0.64,                // 实例每小时（折后 TradePrice）
    "disk": 0.08,                    // 系统盘每小时
    "bandwidth": 0.00,               // 带宽每小时（按流量=0）
    "total": 0.72                    // 每小时总价
  },
  "breakdown": {
    "instanceOriginal": 0.84,        // 实例按量原价
    "instanceDiscount": 0.64,        // 实例折后价
    "instanceDiscountRate": 0.76,    // 折扣率 = 折后/原价
    "diskOriginal": 0.10,
    "diskDiscount": 0.08,
    "spotMode": "NoSpot"             // 当前模式
  },
  "estimates": [
    { "hours": 1,  "total": 0.72, "label": "1 小时" },
    { "hours": 4,  "total": 2.88, "label": "4 小时 ⭐" },
    { "hours": 8,  "total": 5.76, "label": "8 小时" },
    { "hours": 24, "total": 17.28, "label": "1 天" }
  ],
  "spotAdvice": {                    // 仅抢占式时返回
    "releaseRate": 0.03,             // 释放率 3%
    "historicalDiscount": 0.75,      // 历史折扣 75%
    "estimatedSpotPrice": 0.17       // 预估抢占价
  },
  "ossStorage": {
    "hourlyRatePerGB": 0.000125,     // 0.09元/GB/月 ÷ 720h
    "monthlyRatePerGB": 0.09,
    "note": "实际费用取决于工作区数据量"
  },
  "currency": "CNY"
}
```

> **价格口径（D8）**：以上所有 `hourly.*` 与 `estimates` 均基于 DescribePrice 返回的 **TradePrice（折后价）**。文中数字为示意，实现以实值为准。

### 13.2 后端调用链

```
/api/price/calculate
  │
  ├─ 读取 AK/SK（从 Neon settings 表解密）
  │
  ├─ 调 DescribePrice（一次请求，含实例+系统盘+带宽）:
  │    RegionId: region
  │    ResourceType: "instance"
  │    InstanceType: instanceType
  │    ImageId: 该地域 Ubuntu 22.04 镜像 ID（与 D4 一致）
  │    SystemDisk.Category: diskCategory
  │    SystemDisk.Size: diskSize
  │    InternetMaxBandwidthOut: bandwidth
  │    InternetChargeType: "PayByTraffic"
  │    SpotStrategy: spotStrategy
  │    SpotDuration: spotDuration
  │    SpotPriceLimit: spotPriceLimit
  │    PriceUnit: "Hour"
  │    Period: 1
  │
  ├─ 解析 DetailInfos:
  │    instanceType → hourly.instance（取 TradePrice）
  │    systemDisk   → hourly.disk
  │    bandwidth    → hourly.bandwidth
  │    originalPrice → breakdown.*Original
  │
  ├─ 若 SpotStrategy != NoSpot:
  │    调 DescribeSpotAdvice → releaseRate, historicalDiscount
  │
  └─ 计算 estimates: hourly.total × durationHours
```

### 13.3 前端联动机制

```
用户任一操作 → debounce 300ms → 调 /api/price/calculate → PricePanel 更新

首次加载某个地域时:
  一次性拉取所有规格的基准价（/api/ecs/types 包含价格）
  存入前端 state

后续操作:
  切换规格/磁盘/带宽等 → 用前端 state 中的基准价 × 折扣率即时计算
  无需再调 API → 即时响应

切换地域时:
  重新拉取该地域所有规格价格 → 更新基准价 state
```

### 13.4 抢占式三种模式

| 模式 | SpotStrategy | SpotDuration | SpotPriceLimit | 价格特点 |
|---|---|---|---|---|
| 无保障 | SpotAsPriceGo | 0 | — | 最便宜，随时可能被回收 |
| 1h 保障+自动出价 | SpotAsPriceGo | 1 | — | 保护期 1h，价格 +10~20% |
| 1h 保障+固定上限 | SpotWithPriceLimit | 1 | 用户输入 | 上限价以内竞标，超出按量原价 |

固定上限输入时前端显示参考条：

```
固定上限: ¥0.30/时  [━━━━━━●━━━━━]
按量原价: ¥0.84/时  [━━━━━━━━━━━━━●]
市场价:   ¥0.17/时  [━●━━━━━━━━━━━━]
```

---

## 十四、API 端点清单

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/signin` | 登录 |
| POST | `/api/auth/signout` | 登出 |
| GET | `/api/auth/session` | 当前会话 |

### 账户

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/account/balance` | 查询余额（QueryAccountBalance） |
| POST | `/api/account/test-connection` | 测试 AK 连接 |

### ECS

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ecs/regions` | 地域列表（DescribeRegions） |
| GET | `/api/ecs/types?region=X` | 规格列表+配置（DescribeInstanceTypes + DescribeAvailableResource） |
| GET | `/api/ecs/price` | 单规格价格（DescribePrice） |
| GET | `/api/ecs/spot-advice` | 抢占释放率/折扣（DescribeSpotAdvice） |
| GET | `/api/ecs/spot-history` | 历史价格（DescribeSpotPriceHistory） |

### ACR

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/acr/instances` | ACR 实例列表 |
| GET | `/api/acr/repositories` | 镜像仓库列表 |
| GET | `/api/acr/images?repo=X` | 镜像版本列表 |

### Git

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/git/auth` | GitHub/CNB OAuth 授权入口 |
| GET | `/api/git/callback` | OAuth 回调 |
| GET | `/api/git/repos` | 仓库列表 |
| GET | `/api/git/branches?repo=X` | 分支列表 |

### 工作区

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/workspaces` | 工作区列表（含状态） |
| GET | `/api/workspaces/:id` | 工作区详情（含 ECS 实时状态） |
| POST | `/api/workspaces` | 创建工作区 |
| POST | `/api/workspaces/:id/start` | 启动工作区（快速/精确变配） |
| POST | `/api/workspaces/:id/stop` | 停止工作区（RunCommand + DeleteInstance） |
| POST | `/api/workspaces/:id/renew` | 续期（ModifyInstanceAutoReleaseTime） |
| DELETE | `/api/workspaces/:id` | 删除工作区（清 OSS + DB） |

### 价格

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/price/calculate` | 动态价格计算 |

### 健康/心跳

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/health/:workspaceId` | ECS 健康回调（启动完成上报，带 accessToken 鉴权） |
| POST | `/api/health/:workspaceId/idle` | 空闲上报（带 accessToken 鉴权） |
| POST | `/api/health/:workspaceId/heartbeat` | 前端心跳 |

> 原设计中的 `/api/health/:id/oss-usage` 与 `/ready-to-release` 两个端点已移除：停止流程改为 RunCommand 执行，OSS 占用从脚本 stdout 解析（D3），无需 ECS 反调这两个接口。

---

## 十五、界面详细设计

### 屏 1：登录页

```
┌──────────────────────────────────────────────┐
│                                              │
│           Workspace Cloud                    │
│           云端开发环境                        │
│                                              │
│  用户名: [________________________]          │
│  密  码: [________________________]          │
│                                              │
│           [登录]                              │
│                                              │
│  或: [GitHub] [CNB] OAuth 登录               │
│                                              │
└──────────────────────────────────────────────┘
```

- 首次登录检查：Neon 查 settings 表 → 无 AK 记录 → 强制跳转 `/setup`
- NextAuth Credentials Provider + GitHub OAuth Provider

### 屏 2：初始化向导（`/setup`，首次必须填）

```
┌──────────────────────────────────────────────────────┐
│  🚀 首次设置                                         │
│                                                      │
│  ① 阿里云账号                                        │
│  AccessKey ID:      [________________________]       │
│  AccessKey Secret:  [________________________]       │
│  [测试连接]  ✅ 连接成功！余额: ¥12,345.67            │
│                                                      │
│  ② 全局默认设置（创建工作区时可覆盖）                   │
│  默认地域:          [cn-hangzhou ▼]                   │
│  默认实例规格:      [ecs.g6.xlarge (4c8g) ▼]         │
│  默认磁盘类型:      [ESSD PL0 ▼]                     │
│  默认磁盘大小:      [40GB ──────]                    │
│  默认公网带宽:      [10Mbps ──────]                  │
│  自动释放时间:      [4小时 ▼]                         │
│  无操作休眠阈值:    [30分钟 ▼]                        │
│  默认抢占策略:      [不使用抢占 ▼]                     │
│  默认抢占保障:      [1小时 ▼]                         │
│                                                      │
│  ③ 资源初始化（首次使用该地域时自动创建）               │
│  ACR 容器镜像服务:  [自动创建 / 选择已有 ▼]            │
│  OSS 存储桶:        自动创建                           │
│                                                      │
│           [保存并进入仪表盘 →]                        │
└──────────────────────────────────────────────────────┘
```

**背后 API 调用链**：
1. `POST /api/account/test-connection` → `QueryAccountBalance` 验证 AK + 显示余额
2. `GET /api/ecs/regions` → `DescribeRegions` 填充地域下拉
3. `GET /api/ecs/types?region=X` → `DescribeInstanceTypes` 填充规格下拉
4. 保存到 Neon settings 表（AK/SK 加密存储）

### 屏 3：仪表盘（`/`）

```
┌────────────────────────────────────────────────────────────────────┐
│  Workspace Cloud                              💰 ¥12,345.67 [刷新] │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                    │
│  [+ 新建工作区]                                                    │
│                                                                    │
│  ┌──────┬───────┬───────────────┬──────┬────────┬───────────────┐ │
│  │ 名称 │ 规格   │ 镜像           │ 状态  │ 到期时间│ 操作          │ │
│  ├──────┼───────┼───────────────┼──────┼────────┼───────────────┤ │
│  │ ws-1 │ 4c8g  │ code-base:22  │ 🟢运行│ 2h后   │ [进入][停止]  │ │
│  │ ws-2 │ 2c4g  │ dev-go:1.22   │ ⏸已停│ -      │ [启动][删除]  │ │
│  └──────┴───────┴───────────────┴──────┴────────┴───────────────┘ │
│                                                                    │
│  ⚠️ ws-2 OSS占用: 2.3GB  ws-3 OSS占用: 15.8GB [接近阈值]         │
└────────────────────────────────────────────────────────────────────┘
```

**背后 API 调用链**：
1. `GET /api/account/balance` → `QueryAccountBalance` 显示余额
2. `GET /api/workspaces` → Neon 查 workspace 表 + workspace_states 表
3. 对每个 RUNNING 工作区 → `DescribeInstances` 校验 ECS 实时状态
4. OSS 空间占用 → `ListObjectsV2` 计算（或从 workspace_states.oss_usage_bytes 读缓存）

### 屏 4：新建工作区（`/workspaces/new`，单页表单）

```
┌────────────────────────────────────────────────────────────────────┐
│  新建工作区                                                         │
│                                                                    │
│  名称:     [my-project_________]                                   │
│                                                                    │
│  ══════════════════════════════════════════════════════════════════ │
│  ① 实例规格                                                        │
│  地域:     [cn-hangzhou ▼]   可用区: [自动 ▼]                      │
│  付费模式: (●) 按量付费  (○) 抢占式                                 │
│                                                                    │
│  ┌─ 按量付费 Tab ────────────────────────────────────────────────┐ │
│  │  ecs.c6.large    2核4G   1.5Gbps   ¥0.22/h                  │ │
│  │  ecs.g6.xlarge   4核8G   2Gbps     ¥0.84/h    ← 推荐        │ │
│  │  ecs.g7.2xlarge  8核16G  4Gbps     ¥1.96/h                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ 抢占式 Tab ──────────────────────────────────────────────────┐ │
│  │  使用时长保障:                                                 │ │
│  │  (○) 无保障（随时可能释放，最便宜）                              │ │
│  │  (●) 1小时保障（保护期，稍贵，释放率更低）                       │ │
│  │                                                               │ │
│  │  出价策略:                                                     │ │
│  │  (●) 自动出价（跟随市场价，最高 = 按量原价）                     │ │
│  │  (○) 固定上限出价  [____]元/小时                                │ │
│  │       当前按量原价参考: ¥0.84/h                                │ │
│  │                                                               │ │
│  │  释放率: 3%  历史折扣: 75%                                      │ │
│  │  预估抢占价: ¥0.17/h (自动) 或 ¥0.25/h (保障1h)                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  系统盘:  [40GB ──────]  公网IP: [ON ──]                           │
│                                                                    │
│  ══════════════════════════════════════════════════════════════════ │
│  ② 环境镜像                                                        │
│  Docker 镜像地址: [________________________]                        │
│  支持格式: registry.cn-hangzhou.aliyuncs.com/ns/repo:tag           │
│           或 ghcr.io/user/image:tag 等任意 Docker 镜像链接           │
│  已选镜像: code-server-base:latest (1.2GB) ✅                      │
│                                                                    │
│  ══════════════════════════════════════════════════════════════════ │
│  ③ 开发工具 (Features)                                             │
│  ☑ Node.js        版本: [v22 LTS ▼]    [配套: nvm]                │
│  ☑ Python         版本: [3.12 ▼]       [配套: pyenv]              │
│  ☐ Go             版本: [1.22 ▼]       [配套: goenv]              │
│  ☐ Java           版本: [21 ▼]         [配套: sdkman]             │
│  ☑ Git + GitHub CLI                                            │
│  ☑ Docker-in-Docker                                            │
│                                                                    │
│  ══════════════════════════════════════════════════════════════════ │
│  ④ Git 仓库                                                        │
│  自动拉取代码?  [ON ──]                                             │
│  平台: [GitHub ▼]  [授权状态: ✅ 已授权]                            │
│  仓库: [搜索 my-project...]                                        │
│  分支: [main ▼]                                                    │
│  → 拉取 github.com/user/my-project (main) 到 /workspace            │
│                                                                    │
│  ══════════════════════════════════════════════════════════════════ │
│  ⑤ 生命周期设置                                                     │
│  自动释放时间:   [跟随全局默认 (4h) ▼]  ☑ 自定义: [  8  ] 小时      │
│  无操作休眠阈值: [跟随全局默认 (30m) ▼] ☑ 自定义: [  60  ] 分钟     │
│                                                                    │
│  ══════════════════════════════════════════════════════════════════ │
│  ⑥ 价格面板（底部固定，随上方选择实时变化）                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  💰 价格明细                                        [实时]   │ │
│  │  ┌──────────────┬──────────────┬──────────────┐             │ │
│  │  │  按量付费     │  抢占式(1h)   │ 抢占式(无保障) │             │ │
│  │  │  ¥0.84/时    │  ¥0.25/时    │  ¥0.17/时     │             │ │
│  │  │  ● 已选      │              │               │             │ │
│  │  └──────────────┴──────────────┴──────────────┘             │ │
│  │  分项: 实例 ¥0.64 | 系统盘 ¥0.08 | 带宽 ¥0.00              │ │
│  │  预估: 1h=¥0.72  4h=¥2.88  8h=¥5.76  1天=¥17.28            │ │
│  │  释放率: 3%  历史折扣: 75%                                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│           [创建工作区 🚀]                                           │
└────────────────────────────────────────────────────────────────────┘
```

### 屏 5：工作区详情 — 已停止（`/workspaces/:id`）

```
┌──────────────────────────────────────────────────────────────┐
│  ← 返回                    ws-2 · dev-go:1.22               │
│                                                              │
│  状态: ⏸ 已停止                                              │
│  规格: ecs.g6.xlarge (4c8g) · ESSD 40GB · 10Mbps            │
│  镜像: code-server-base:latest                               │
│  Features: Go 1.22, Git + GitHub CLI                         │
│  Git: github.com/user/go-project (dev)                       │
│  自动释放: 跟随全局 (4h)                                       │
│  无操作休眠: 跟随全局 (30m)                                    │
│  OSS占用: 2.3GB                                               │
│  最后运行: 2026-09-05 14:30                                   │
│                                                              │
│  ── 快速启动 ──                                              │
│  [▶ 按量启动 (¥0.84/h)]    [▶ 抢占式启动 (¥0.17/h)]         │
│    使用当前配置                            使用当前配置         │
│    全局默认参数                            全局默认抢占参数     │
│                                          ⚠ 需先确认规格可抢占  │
│                                                              │
│  ── 精确变配启动 ──                                          │
│  [✏ 选择规格后启动]  → 打开完整规格选择流程                   │
│                                                              │
│  ── 操作 ──                                                  │
│  [✏️ 编辑配置]  [🗑 删除工作区]                               │
│                                                              │
│  ── 操作历史 ──                                              │
│  2026-09-05 14:30  TERMINATE  释放 ecs.i-bp1abc...           │
│  2026-09-05 10:00  START      启动 ecs.i-bp1abc... (按量)     │
│  2026-09-04 16:00  CREATE     创建工作区                     │
└──────────────────────────────────────────────────────────────┘
```

### 屏 6：工作区详情 — 运行中

```
┌──────────────────────────────────────────────────────────────┐
│  ← 返回                    ws-2 · dev-go:1.22               │
│                                                              │
│  状态: 🟢 运行中                                              │
│  ECS 实例: i-bp1abc123def456                                 │
│  公网地址: 47.96.xx.xx:8080                                   │
│  到期时间: 2026-09-05 18:30  [续期 +1h] [+4h]                │
│                                                              │
│  [🔗 进入 IDE]  [⏹ 停止]  [✏️ 编辑配置]  [🗑 删除工作区]    │
│                                                              │
│  ── 操作历史 ──                                              │
│  2026-09-05 14:30  START      启动 ecs.i-bp1abc... (按量)     │
│  2026-09-04 16:00  CREATE     创建工作区                     │
└──────────────────────────────────────────────────────────────┘
```

### 屏 7：进入 IDE

新标签页打开：`http://47.96.xx.xx:8080/`

- 完整 code-server（浏览器里的 VS Code），使用 **Basic 认证**：用户名为任意，密码 = 后端生成的 `access_token`（界面显示密码 + 一键复制按钮）
- 左侧文件树：`/workspace` 里已有仓库代码
- 终端可用：Features 安装的工具已就绪
- 无后端调用，直连 ECS 公网 IP + 端口

### 屏 8：空闲检测横幅（IDE 内）

用户无操作超阈值后，IDE 顶部出现：

```
⚠️ 您已空闲 25 分钟，将在 5 分钟后自动休眠释放。[继续使用]
```

- 点击「继续使用」→ POST `/api/health/:id/heartbeat` → 清除 idle 标记
- 不操作 → 5 分钟后触发释放流程

### 屏 9：终止流程 UI

```
┌──────────────────────────────────────────┐
│  ⏳ 正在终止工作区...                      │
│                                          │
│  ☑ 正在保存未提交文件...                  │
│  ☑ 已保存快照 (12 个文件, 2.3MB)          │
│  ☑ 已清理已跟踪文件                       │
│  ☑ 实例已释放                             │
│  ✅ 已完成，数据已保留                     │
└──────────────────────────────────────────┘
```

### 屏 10：全局设置页（`/settings`）

```
┌──────────────────────────────────────────────────────────────┐
│  全局设置                                                     │
│                                                              │
│  ── 阿里云账号 ──                                            │
│  AccessKey ID:     [________________]  [测试连接]             │
│  AccessKey Secret: [________________]  [显示/隐藏]           │
│  当前余额: ¥12,345.67  [刷新]                                │
│                                                              │
│  ── 默认地域 ──                                              │
│  [cn-hangzhou ▼]                                             │
│                                                              │
│  ── 默认实例配置 ──                                          │
│  规格:    [ecs.g6.xlarge ▼]                                  │
│  磁盘类型: [ESSD PL0 ▼]                                      │
│  磁盘大小: [40GB ──────]                                     │
│  带宽:    [10Mbps ──────]                                    │
│                                                              │
│  ── 默认生命周期 ──                                          │
│  自动释放:  [4小时 ▼]                                         │
│  空闲阈值:  [30分钟 ▼]                                        │
│                                                              │
│  ── 默认抢占配置 ──                                          │
│  策略:     [不使用抢占 ▼]                                     │
│  保障:     [1小时 ▼]                                         │
│                                                              │
│  ── 资源管理 ──                                              │
│  ACR 实例: [cri-xxxxx]  [管理控制台]                         │
│  OSS Bucket: [my-dev-workspace-cn-hangzhou]  [管理控制台]    │
│                                                              │
│           [保存设置]                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 十六、安全设计

### 16.1 AK/SK 加密

- 使用 AES-256-GCM 加密后存入 Neon Postgres
- 主密钥（ENCRYPTION_KEY）存在 Vercel 环境变量中
- 加解密逻辑封装在 `lib/aliyun/auth.ts`

### 16.2 code-server 访问安全

- 每次启动生成随机密码 `crypto.randomBytes(16).toString('hex')`（即 `access_token`）
- code-server 使用 Basic 认证，密码 = access_token
- ECS 安全组只放行 8080（及可选 22），入方向白名单可按需限制来源 IP

### 16.3 Git token 安全

- OAuth token 加密后存 Neon（git_token_enc）
- 后端生成 UserData 时解密并拼成 `GIT_AUTHED_URL`，注入后 ECS 内使用，不落盘、不进入进程参数
- 优先使用 ACR RAM Role（ECS 绑定角色）避免硬编码

### 16.4 网络安全

- OSS/ACR/ECS **必须同地域**：内网访问零流量费
- ossfs 挂载使用内网 endpoint `oss-{region}-internal.aliyuncs.com`
- Vercel Serverless 调用阿里云 API 走 HTTPS
- ECS 内 ossfs/ACR 均通过实例 RAM Role 获取 STS 临时凭证，AK/SK 不落盘

---

## 十七、错误处理模式

| 场景 | 处理 |
|---|---|
| ECS 创建失败（库存不足） | 返回错误 + 建议切换可用区/规格/地域 |
| AK 权限不足 | 返回具体缺失权限列表 + 引导到 RAM 控制台 |
| code-server 启动超时（5 分钟无健康回调） | 自动释放 ECS + 更新状态 FAILED + 通知用户 |
| 空闲释放触发失败 | AutoReleaseTime 作为硬兜底（阿里云侧到期必释放） |
| RunCommand 执行超时（120s 未 Finished） | 跳过清理直接 DeleteInstance（数据靠 git remote + 已实时落 OSS 兜底），记录告警 |
| OSS 空间超阈值 | Dashboard 显示警告 + 可引导用户清理 |
| ACR 镜像拉取失败 | 返回错误 + 检查镜像地址/权限 |
| ossfs 挂载失败 | 降级为普通磁盘（不持久化）+ 警告用户 |

---

## 十八、里程碑详细任务

### M1：骨架搭建（2~3 周）

**目标**：登录 → AK 配置 → 选规格 → 创建 ECS → 跑 code-server → 浏览器进入 IDE → 停止释放

| 任务 | 内容 | 依赖 | 预估 |
|---|---|---|---|
| **M1.1** 项目初始化 | Next.js 14+ (App Router, TypeScript, Tailwind) + Shadcn/UI init + Drizzle + Neon + 部署到 Vercel | — | 1天 |
| **M1.2** 数据库迁移 | Drizzle schema（users, settings, workspaces, workspace_states, audit_logs）+ 初始迁移 | M1.1 | 0.5天 |
| **M1.3** 认证 | NextAuth v5 Credentials Provider + `.env` 管理员账号 | M1.1 | 1天 |
| **M1.4** 初始化向导 | `/setup` 页面：填 AK/SK → 测试连接 → 选默认地域 → 保存加密到 DB | M1.2, M1.3 | 2天 |
| **M1.5** 阿里云 SDK 封装 | `lib/aliyun/ecs.ts`：RunInstances/DescribeInstances/DeleteInstance/DescribePrice/DescribeInstanceTypes/DescribeAvailableResource/DescribeRegions/**DescribeImages**/**RunCommand**/**DescribeInvocationResults**/**ModifyInstanceAutoReleaseTime**；`lib/aliyun/bss.ts`：QueryAccountBalance；`lib/aliyun/auth.ts`：AK 加解密 | M1.1 | 2天 |
| **M1.6** 规格选择组件 | `InstanceSelector.tsx`（规格卡片 + 按量/抢占 Tab）；`/api/ecs/types` 拉规格+价格 | M1.5 | 2天 |
| **M1.7** UserData 脚本 | `docker/entrypoint.sh`（基础版）：装 docker/ossfs → 挂载 → `docker run code-server`（D2）→ 上报健康（D5） | M1.5 | 1天 |
| **M1.8** 工作区创建 API | `POST /api/workspaces`：生成 UserData → RunInstances(异步) → Neon 写记录(STATUS=PROVISIONING)；含 8.1 资源配置（ImageId/VPC/安全组） | M1.5, M1.7 | 2天 |
| **M1.9** 健康回调 | `POST /api/health/:workspaceId`：校验 accessToken → Neon 更新 STATUS=RUNNING，存公网 IP+port+token | M1.8 | 1天 |
| **M1.10** Dashboard | 工作区列表页（轮询状态）；`/api/workspaces` + `/api/workspaces/:id` | M1.8 | 1.5天 |
| **M1.11** 进入 IDE | 点击 → 新标签页 `http://{ip}:8080` + 显示密码（access_token） | M1.9 | 0.5天 |
| **M1.12** 停止/删除 | 停止：`POST /api/workspaces/:id/stop` → RunCommand(简单版) → DeleteInstance → Neon 更新 STOPPED；删除：`DELETE` → 清 OSS+DB | M1.5, M1.8 | 1.5天 |
| **M1.13** 余额显示 | Dashboard 顶部余额栏（定时刷新 + 手动刷新） | M1.4 | 0.5天 |

**M1 合计约 17 个工作日（3.5 周）**

**M1 交付物**：
- 用户能登录 → 配置 AK → 选规格 → 创建 ECS 实例 → 进入 code-server IDE → 停止释放
- **M1 不涉及**：ossfs 持久化（先用本地盘）、Git clone、Features、动态价格面板、空闲检测

### M2：持久化 + Git + Features（2~3 周）

**目标**：ossfs 挂 workspace → OSS 持久化 → 停止时快照增量 → Git 自动 clone → Features 动态安装 → 启动恢复

| 任务 | 内容 | 依赖 | 预估 |
|---|---|---|---|
| **M2.1** OSS 封装 | `lib/aliyun/oss.ts`：GetBucketInfo/PutBucket/ListObjectsV2/DeleteObject | M1.5 | 1天 |
| **M2.2** OSS 自动创建 | 首次使用某地域 → 自动 PutBucket → Neon 存 bucket 名 | M2.1 | 0.5天 |
| **M2.3** ACR 封装 | `lib/aliyun/acr.ts`：ListInstance/CreateInstance/ListRepository/ListImage | M1.5 | 1天 |
| **M2.4** ACR 自动创建 | 首次使用 → 自动 CreateInstance → 存 ID | M2.3 | 0.5天 |
| **M2.5** UserData 完整版 | entrypoint.sh 加入：ossfs 挂载、快照恢复、Features 安装（docker exec）、idle watcher | M1.7, M2.1 | 2天 |
| **M2.6** Git OAuth | GitHub OAuth 流程 + `/api/git/auth` + `/api/git/callback` | M1.3 | 1.5天 |
| **M2.7** 仓库选择 | `/api/git/repos` + `/api/git/branches`；前端 `GitSelector.tsx` 组件 | M2.6 | 1天 |
| **M2.8** Clone 注入 | UserData 注入 GIT_AUTHED_URL+repoURL+branch → entrypoint git clone | M2.5, M2.7 | 1天 |
| **M2.9** Features 目录 | `features.json`：Node/Python/Go/Java/Docker-in-Docker/Git 等，每个含版本列表+installScript；前端 `FeatureSelector.tsx` 多选+版本选择 | — | 2天 |
| **M2.10** Features 安装 | entrypoint 按 JSON 执行 features 的 installScript → docker exec 装到容器 `/opt/{tool}/` | M2.5, M2.9 | 1天 |
| **M2.11** 停止钩子 | `stop-hook.sh`：打包 untracked → .snapshots/ → 打包漫游配置 → 删除已跟踪文件 → RunCommand 执行 + 解析 OSS 用量 → DeleteInstance | M2.5 | 2天 |
| **M2.12** 快照恢复 | entrypoint 启动时检查 .snapshots/ → 解压覆盖 → git pull | M2.5, M2.11 | 1天 |
| **M2.13** 启动流程 | 详情页「按量启动」/「抢占式启动」/「精确变配启动」；启动前检查（可抢占验证+余额校验）；启动后规格覆盖写入 workspace 配置 | M1.8, M1.6 | 2天 |
| **M2.14** 空闲检测 | `idle-watcher.sh`：监控活动 → 超阈值 → POST `/api/health/:id/idle` → 触发释放 | M1.9 | 1.5天 |

**M2 合计约 17 个工作日（3.5 周）**

**M2 交付物**：
- ossfs 挂载 /workspace 实时落 OSS
- Git 自动 clone + 快照恢复
- Features 动态安装（版本可选）
- 一键启动（按量/抢占）+ 精确变配启动
- 空闲自动休眠 + 手动终止
- 停止时自动清理已跟踪文件只存增量

### M3：价格引擎 + 打磨（2~3 周）

**目标**：动态实时价格面板 → 抢占式三种模式完整支持 → OSS 空间监控 → 全局设置管理

| 任务 | 内容 | 依赖 | 预估 |
|---|---|---|---|
| **M3.1** 价格计算引擎 | `lib/price/calculator.ts` + `/api/price/calculate`：DescribePrice 封装（实例+系统盘+带宽一次调）→ 返回分项价格+预估费用（折后价 D8） | M1.5 | 2天 |
| **M3.2** PricePanel 组件 | 底部固定价格面板：分项明细 + 多时段预估 + 折扣率/释放率 | M3.1 | 1.5天 |
| **M3.3** 动态联动 | InstanceSelector/DiskSlider/BandwidthSlider/SpotConfig/DurationSelector → 任一变动 → debounce 300ms → 调 price/calculate → PricePanel 更新 | M3.1, M3.2, M1.6 | 2天 |
| **M3.4** 抢占式完整 | SpotConfig 组件：三种模式 → 固定上限输入时显示按量原价参考条 → DescribeSpotAdvice 显示释放率+折扣率 | M3.3 | 1.5天 |
| **M3.5** 历史价格 | DescribeSpotPriceHistory → Recharts 近 30 天价格曲线图 | M3.4 | 1天 |
| **M3.6** OSS 空间监控 | 停止时解析 OSS 用量（stop-hook stdout）→ 上报 Neon → Dashboard 显示占用 + 超阈值告警 | M2.11, M2.1 | 1天 |
| **M3.7** 全局设置页 | `/settings`：编辑 AK/SK、默认地域/规格/时限/抢占参数/磁盘/带宽 | M1.4 | 1.5天 |
| **M3.8** 余额实时刷新 | Dashboard 顶部余额 → 定时刷新（60s）+ 手动刷新；余额低于阈值红色警告 | M1.4 | 0.5天 |
| **M3.9** 审计日志 | 每次 CREATE/START/STOP/DELETE 写 audit_logs → 工作区详情页展示操作历史 | M1.8 | 1天 |
| **M3.10** 错误处理 | 创建失败重试提示、ECS 库存不足处理、AK 权限不足引导、OSS 空间满警告、code-server 启动超时处理 | 全局 | 1.5天 |

**M3 合计约 13.5 个工作日（2.5 周）**

**M3 交付物**：
- 完整的动态价格计算（每步操作实时更新面板）
- 抢占式三种模式完整定价 + 释放率/折扣率
- 历史价格曲线图
- OSS 空间监控 + 阈值提醒
- 全局设置管理
- 操作审计日志
- 完善的错误处理

---

## 十九、环境变量

```bash
# NextAuth
NEXTAUTH_SECRET=<随机生成>
NEXTAUTH_URL=https://your-domain.vercel.app
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<bcrypt hash>

# Neon Postgres
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# Upstash Redis (M2+ 可选)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...

# AES 加密主密钥（64 字节 hex = 32 字节密钥）
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# 部署期配置（代码/常量，非环境变量）
# - ECS RAM Role 名: workspace-cloud-ecs-role（OSS + ACR 权限）
# - code-server 端口固定 8080
# - GitHub OAuth Client ID/Secret、CNB OAuth 凭据（随 NextAuth provider 配置）
```

---

## 二十、关键技术约束总结

| 约束 | 方案 |
|---|---|
| Vercel Serverless 无状态 | 所有运行态数据存 Neon/Redis，ECS 状态靠轮询+回调 |
| Vercel 无长连接 | IDE 直连 ECS 公网 IP，不做 WebSocket 代理；停止走云助手 RunCommand |
| Git token 安全 | 后端拼 GIT_AUTHED_URL 注入 UserData，ECS 内使用后不落盘 |
| 同地域内网 | Bucket/ACR/ECS 三者必须同地域，ossfs 走内网 endpoint |
| 代码持久化 | ossfs 实时挂 OSS + 停止时只保留未提交增量（已提交靠 git remote） |
| AutoReleaseTime 兜底 | 即使所有释放逻辑挂掉，阿里云侧到期必释放，钱不会失控 |
| 冷启动延迟 | ECS 创建到 IDE 可用约 2~5 分钟（UserData 自举），前端显示进度 |
| 无元数据引擎 | 采用 ossfs 而非 JuiceFS，避免常驻元数据服务（D1） |

