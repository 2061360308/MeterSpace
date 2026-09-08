# Registry 仓库设计方案

## 一、概述

MeterSpace Registry 是一个托管在 GitHub 上的静态资源仓库，用于管理镜像和 Feature 的市场索引数据。

### 核心原则

| 原则 | 说明 |
|------|------|
| 兼容 DevContainer | Feature 格式完全兼容官方 `devcontainer-feature.json` |
| 静态托管 | JSON 文件托管在 GitHub Pages，无需后端服务 |
| 后端代理 | 前端通过后端 API 访问，避免 GitHub 匿名限制 |
| 无脚本市场 | 脚本是用户个性化操作，不参与市场分发 |

## 二、目录结构

```
workspace-cloud-registry/
├── registry.json                    # Registry 元数据
├── images/                          # 镜像定义
│   ├── node-22.json
│   ├── python-3.12.json
│   └── ...
├── features/                        # Feature 定义
│   ├── node.json
│   ├── python.json
│   └── ...
├── marketplace-index.json           # 构建生成的聚合索引
└── .github/
    └── workflows/
        ├── validate.yml             # PR 验证 JSON schema
        └── build-index.yml          # 合并生成 marketplace-index.json
```

## 三、数据格式

### 3.1 registry.json

```json
{
  "name": "meterspace-registry",
  "version": "1.0.0",
  "description": "MeterSpace 官方资源仓库",
  "homepage": "https://github.com/your-org/workspace-cloud-registry"
}
```

### 3.2 images/*.json

```json
{
  "id": "node-22",
  "name": "Node.js 22",
  "description": "官方 Node.js 22 镜像，适用于 JavaScript/TypeScript 开发",
  "uri": "docker.io/library/node:22",
  "architecture": "amd64",
  "tags": ["javascript", "typescript", "nodejs"]
}
```

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| id | ✅ | string | 唯一标识，对应 DB 的 marketplace_id |
| name | ✅ | string | 显示名称 |
| description | ✅ | string | 简短描述 |
| uri | ✅ | string | Docker 镜像地址 |
| architecture | ❌ | string | 默认 `amd64`，可选 `arm64` |
| tags | ❌ | string[] | 搜索用标签 |

### 3.3 features/*.json

完全兼容 DevContainer 官方 `devcontainer-feature.json` 格式，额外添加 `uri` 和 `tags` 字段：

```json
{
  "id": "node",
  "version": "2.1.0",
  "name": "Node.js (via nvm), yarn and pnpm.",
  "description": "Installs Node.js, nvm, yarn, pnpm, and needed dependencies.",
  "documentationURL": "https://github.com/devcontainers/features/tree/main/src/node",
  "uri": "ghcr.io/devcontainers/features/node:2",

  "options": {
    "version": {
      "type": "string",
      "proposals": ["lts", "latest", "22", "20", "18"],
      "default": "lts",
      "description": "Select or enter a Node.js version to install"
    },
    "nodeGypDependencies": {
      "type": "boolean",
      "default": true,
      "description": "Install dependencies to compile native node modules (node-gyp)?"
    },
    "pnpmVersion": {
      "type": "string",
      "proposals": ["latest", "8.8.0", "none"],
      "default": "latest",
      "description": "Select or enter the PNPM version to install"
    }
  },
  "containerEnv": {
    "NVM_DIR": "/usr/local/share/nvm",
    "NVM_SYMLINK_CURRENT": "true",
    "PATH": "/usr/local/share/nvm/current/bin:${PATH}"
  },
  "installsAfter": [
    "ghcr.io/devcontainers/features/common-utils"
  ],
  "customizations": {
    "vscode": {
      "extensions": ["dbaeumer.vscode-eslint"]
    }
  },

  "tags": ["javascript", "typescript", "nodejs", "npm", "yarn", "pnpm"]
}
```

| 字段 | 必填 | 来源 | 说明 |
|------|------|------|------|
| id | ✅ | DevContainer | 唯一标识，匹配目录名 |
| version | ✅ | DevContainer | semver 版本号 |
| name | ✅ | DevContainer | 显示名称 |
| description | ✅ | DevContainer | 描述 |
| documentationURL | ❌ | DevContainer | 文档链接 |
| uri | ✅ | MeterSpace | OCI 拉取地址 |
| options | ❌ | DevContainer | 可配置选项 |
| containerEnv | ❌ | DevContainer | 容器环境变量 |
| installsAfter | ❌ | DevContainer | 安装顺序（软依赖） |
| dependsOn | ❌ | DevContainer | 硬依赖 |
| customizations | ❌ | DevContainer | IDE 集成配置 |
| deprecated | ❌ | DevContainer | 是否已废弃 |
| tags | ❌ | MeterSpace | 搜索用标签 |

### 3.4 marketplace-index.json

由 CI 自动聚合生成，前端直接消费：

```json
{
  "version": "1.0.0",
  "updatedAt": "2024-01-15T10:30:00Z",
  "images": [
    {
      "id": "node-22",
      "name": "Node.js 22",
      "description": "官方 Node.js 22 镜像",
      "uri": "docker.io/library/node:22",
      "architecture": "amd64",
      "tags": ["javascript", "typescript"]
    }
  ],
  "features": [
    {
      "id": "node",
      "version": "2.1.0",
      "name": "Node.js (via nvm), yarn and pnpm.",
      "description": "Installs Node.js, nvm, yarn, pnpm.",
      "uri": "ghcr.io/devcontainers/features/node:2",
      "options": { ... },
      "containerEnv": { ... },
      "installsAfter": [...],
      "tags": ["javascript", "typescript"]
    }
  ]
}
```

## 四、分类定义

DevContainer 官方无分类系统，由 MeterSpace 自定义：

```typescript
const FEATURE_CATEGORIES = {
  runtime: "语言运行时",
  tool: "开发工具",
  cloud: "云与基础设施",
  database: "数据库",
  network: "网络",
} as const

const IMAGE_CATEGORIES = {
  base: "基础镜像",
  runtime: "运行时镜像",
  application: "应用镜像",
} as const
```

分类存储在 `tags` 字段中，前端按 tag 筛选。

## 五、访问策略

### 5.1 问题

| 服务 | 匿名限制 | 说明 |
|------|---------|------|
| raw.githubusercontent.com | 按 IP 限流，返回 429 | 不支持认证头 |
| GitHub Pages | 100 GB/月（软限制） | 超限联系维护者 |
| GitHub API | 60 请求/小时 | 认证后 5000/小时 |

### 5.2 方案：后端代理缓存 + GitHub Pages

```
用户浏览器 → /api/marketplace → Next.js ISR 缓存 → GitHub Pages
```

- Registry 文件托管在 GitHub Pages（100GB/月足够）
- 后端 API 做 ISR 缓存（5分钟），所有用户共享
- 用户浏览器不直接访问 GitHub

### 5.3 MarketplaceClient

```typescript
// src/lib/marketplace-client.ts

const REGISTRY_URL = process.env.REGISTRY_URL ||
  "https://your-org.github.io/workspace-cloud-registry";

export interface MarketplaceImage {
  id: string;
  name: string;
  description: string;
  uri: string;
  architecture: string;
  tags: string[];
}

export interface MarketplaceFeature {
  id: string;
  version: string;
  name: string;
  description: string;
  uri: string;
  options?: Record<string, unknown>;
  containerEnv?: Record<string, string>;
  installsAfter?: string[];
  tags: string[];
}

export interface MarketplaceIndex {
  version: string;
  updatedAt: string;
  images: MarketplaceImage[];
  features: MarketplaceFeature[];
}

// 后端 API 路由: src/app/api/marketplace/route.ts
export async function GET() {
  const res = await fetch(`${REGISTRY_URL}/marketplace-index.json`, {
    next: { revalidate: 300 },
  });
  const data = await res.json();
  return NextResponse.json(data);
}

// 前端消费
export async function getMarketplaceIndex(): Promise<MarketplaceIndex> {
  const res = await fetch("/api/marketplace");
  return res.json();
}
```

## 六、前端消费流程

```
镜像市场页面：
  1. fetch("/api/marketplace") → 加载索引
  2. 渲染卡片列表
  3. 用户点击"安装" → POST /api/user-images → 写入 user_images 表
     source="marketplace", marketplace_id=id

Feature 市场页面：
  1. fetch("/api/marketplace") → 加载索引
  2. 渲染卡片列表
  3. 用户点击"安装" → 展示 options 配置面板
  4. 用户确认 → POST /api/user-features → 写入 user_features 表
     source="marketplace", marketplace_id=id, options=用户选择
```

## 七、CI 流程

### 7.1 PR 验证

```yaml
# .github/workflows/validate.yml
name: Validate
on:
  pull_request:
    paths: ['images/**', 'features/**']
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate JSON
        run: node scripts/validate.js
```

### 7.2 构建索引

```yaml
# .github/workflows/build-index.yml
name: Build Index
on:
  push:
    branches: [main]
    paths: ['images/**', 'features/**']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build marketplace-index.json
        run: node scripts/build-index.js
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
```

## 八、同步官方 Feature

定时从 DevContainer 官方仓库同步 Feature 数据：

```yaml
# .github/workflows/sync-features.yml
name: Sync Official Features
on:
  schedule:
    - cron: '0 0 * * 1'  # 每周一
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Fetch from ghcr.io
        run: node scripts/sync-features.js
      - name: Create PR
        uses: peter-evans/create-pull-request@v5
```

同步脚本从 OCI registry 拉取官方 `devcontainer-feature.json`，补充 `uri` 和 `tags` 字段后写入 `features/` 目录。

## 九、关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Feature 格式 | 完全兼容 DevContainer | 复用官方生态，用户可配置所有选项 |
| 脚本市场 | 无 | 脚本是用户个性化操作，无共享价值 |
| downloads 字段 | 无 | GitHub 静态仓库无法追踪，由后端 API 记录 |
| 分类系统 | 自定义 tags | 官方无分类，按需求自定义 |
| 访问方式 | 后端代理 + GitHub Pages | 避免匿名限流，共享缓存 |
| 同步策略 | 定时从官方拉取 | 保持数据最新 |
