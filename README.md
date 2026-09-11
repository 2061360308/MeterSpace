# Workspace Cloud

类 Codespaces 的自部署云端开发环境服务。前端 + Serverless 部署在 Vercel，运行时按需创建阿里云 ECS，工作区代码通过 ossfs 实时落 OSS。

完整架构与实现细节见：

- [docs/FINAL-PLAN.md](docs/FINAL-PLAN.md) — **当前实施手册（唯一权威）**
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构总览
- [docs/archive/](docs/archive/) — 历史设计稿（已作废，仅供追溯）

## 技术栈

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Drizzle ORM + Neon Postgres
- NextAuth.js v5（Credentials + GitHub OAuth）
- 阿里云 SDK（ECS / OSS / ACR / BSS）
- ossfs 持久化 + 云助手 RunCommand 停止流程

## 目录结构

```
src/
├── app/
│   ├── (protected)/        # 受保护页面：仪表盘、setup、settings、workspaces
│   ├── login/              # 登录
│   └── api/                # 全部 API 路由
├── components/             # UI 组件
├── lib/
│   ├── aliyun/             # 阿里云 SDK 封装 (client/auth/ecs/oss/acr/bss)
│   ├── ecs/provisioning.ts # 每地域网络资源惰性创建 (VPC/vSwitch/安全组/镜像)
│   ├── git/                # GitHub OAuth + 鉴权 URL
│   ├── price/              # 动态价格计算引擎
│   ├── workspaces/         # 工作区生命周期服务层
│   ├── db/                 # Drizzle schema + client
│   ├── crypto.ts           # AES-256-GCM 加解密
│   └── userdata.ts         # ECS UserData / stop-hook 脚本生成
├── data/features.json      # Features 目录
scripts/                    # 参考脚本 (entrypoint/stop-hook/idle-watcher/seed)
drizzle/                    # 数据库迁移
```

## 快速开始

### 1. 环境准备

```bash
cp .env.example .env
# 填入 DATABASE_URL、ENCRYPTION_KEY、NEXTAUTH_SECRET 等
```

生成加密主密钥：

```bash
openssl rand -hex 32
```

### 2. 初始化数据库

```bash
# 应用迁移
npx drizzle-kit migrate

# 创建首个管理员用户
node scripts/seed.mjs
```

### 3. 阿里云 RAM 准备

1. 创建 RAM 用户，授权 ECS / OSS / BSS / ACR 权限，生成 AK/SK（在应用内填写）
2. 创建 RAM 角色 `workspace-cloud-ecs-role`，授权 OSS（限定 bucket）与 ACR 拉取权限

### 4. 启动

```bash
npm run dev
```

访问 http://localhost:3000 → 登录 → 首次自动进入 `/setup` 填写 AK → 创建工作区。

## 常用命令

```bash
npm run dev        # 开发
npm run build      # 构建（含 lint + typecheck）
npm run lint       # ESLint
npx drizzle-kit generate   # 生成迁移
npx drizzle-kit migrate     # 应用迁移
```

## 环境变量

见 [.env.example](.env.example)。关键项：

- `DATABASE_URL` — Neon Postgres 连接串
- `ENCRYPTION_KEY` — AES-256-GCM 主密钥（64 位 hex）
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL` — NextAuth
- `GITHUB_ID` / `GITHUB_SECRET` — GitHub OAuth（可选）
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — 引导管理员（seed 脚本使用）
