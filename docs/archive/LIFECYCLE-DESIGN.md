# MeterSpace 生命周期 · 片段库 · 脚本编辑模型设计

> ⚠️ **本文档部分内容已被推翻（2026-09-11）**
>
> 请以 [DETAILED-DESIGN.md](DETAILED-DESIGN.md) 为准。本文档保留的历史价值：**§一 四阶段语义、§三 模板场景矩阵、§二.3 片段选择「存文本不存引用」原则**。
>
> **已被推翻的设计**：
> - ~~§4.2「B + 受控的 C：4 个固定脚本 + 附件文件」~~ → 改为**工作空间目录树 + 固定入口脚本**（附件是伪装的目录树，且单文件模型无法承载 Python/Node 脚本）
> - ~~§4.5 的 `script_pre` / `script_main` / `script_post` / `script_onerror` 字段~~ → 改为 `workspace_files` 表 + `entrypoints` JSONB
> - ~~§2.3 片段存独立 TEXT 字段~~ → 片段改为**代码模板**，插入到文件树编辑器

---

## 〇、本轮已确认的决策

| # | 问题 | 决策 |
|---|---|---|
| Q1 | `startup.sh` 瘦身后默认编辑器 | **不预装**。用户自理 |
| Q3 | OSS bucket 命名 | `my-dev-workspace-${region}`，确认一致 |
| Q5 | 脚本失败 | **销毁实例**；调试模式单开（后话，本文预留设计） |
| Q2 | 端口协议 | 未定，本文暂按 `http/tcp` 设计，留扩展位 |
| Q4 | 模板参数数组类型 | 本文明确定义 |

---

## 一、生命周期设计（四阶段）

### 1.1 为什么需要四阶段

当前只有"执行一次脚本"的模型，导致：
- 无法表达"失败时要清理什么"
- 无法表达"成功后才暴露端口"
- 无法表达"多个脚本块之间的编排"

四阶段是**脚本编排的最小完备模型**：

| 阶段 | 语义 | 失败是否阻断 | 是否必填 |
|---|---|---|---|
| `pre` | 执行前：环境准备（装 Docker、配源、clone 代码） | ✅ 阻断 | 否 |
| `main` | 主任务：启动服务（`docker run`、`npm start`） | ✅ 阻断 | 否 |
| `post` | 执行后：收尾（写配置、健康检查、写 ports.json） | ✅ 阻断 | 否 |
| `onError` | 失败后：清理与诊断（收集日志、回滚） | ❌ 不阻断（永远执行） | 否 |

**执行顺序**：`pre` → `main` → `post` → 上报就绪
**失败路径**：任一步失败 → `onError` → 上报失败 → 销毁实例

### 1.2 状态机（修订 `docs/INSTANCE-PLAN.md` §二）

```
                     startInstance()
                           │
                           ▼
                   ┌───────────────┐
                   │ PROVISIONING  │  创建 ECS
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │    BOOTING    │  agent 下载 + 启动
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │  RUNNING_SCRIPT│  ← 新增：脚本执行中
                   │  (bootPhase:   │
                   │   pre/main/post)│
                   └───────┬───────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
    ┌───────────────┐             ┌───────────────┐
    │   RUNNING     │             │   ON_ERROR    │  ← 新增：执行 onError
    │  (端口已暴露)  │             └───────┬───────┘
    └───────┬───────┘                     │
            │                             ▼
            │                     ┌───────────────┐
            │                     │    FAILED     │
            │                     │  (触发销毁)    │
            │                     └───────────────┘
            ▼
    ┌───────────────┐
    │  RELEASING    │  持久化数据
    └───────┬───────┘
            ▼
    ┌───────────────┐
    │    STOPPED    │
    └───────────────┘
```

> **注意**：`RUNNING_SCRIPT` 可以复用现有 `BOOTING` 状态 + 用 `bootPhase` 区分，不必新增状态值（减少改动）。但 `ON_ERROR` 建议新增，因为它是一个可观测的独立阶段。

### 1.3 `bootPhase` 取值（对齐前端进度条）

当前 `instance-detail.tsx:44` 的 `BOOT_PHASES` 是旧流程（安装依赖/挂载OSS/拉镜像/启动容器/恢复配置/恢复快照/克隆仓库/安装环境/自定义脚本/健康检查）。

新流程的 `bootPhase` 应为：

| key | label | 谁上报 |
|---|---|---|
| `agent_bootstrap` | 下载并启动 Agent | entrypoint.sh |
| `env_setup` | 环境准备 | startup.sh |
| `snippet_install` | 安装勾选组件 | startup.sh（片段） |
| `pre_script` | 执行前置脚本 | agent |
| `main_script` | 执行主脚本 | agent |
| `post_script` | 执行收尾脚本 | agent |
| `on_error` | 执行失败清理 | agent |
| `exposing_ports` | 暴露访问端口 | agent |
| `ready` | 就绪 | agent |

**前端 `BOOT_PHASES` 需同步替换。**

### 1.4 后端消费 `agent-status`

`bootPhase` 已能被 `/api/instances/[id]/agent-status` 写入（`agent-status/route.ts:29`），链路是通的。agent 只需在阶段切换时调用 `ReportStatus(phase, message)`。

**agent 侧改动**（`agent/executor/runner.go`）：执行每个阶段前上报一次 phase。

---

## 二、片段（Snippet）机制

### 2.1 设计目标

> 勾选一个片段 → 出现可展开面板 → 面板里是该片段的**完整命令文本**，可直接编辑。

即：**片段 = 带默认内容的可编辑命令块**，勾选/取消控制是否注入。

### 2.2 片段结构

```typescript
export interface Snippet {
  id: string;
  name: string;            // "安装 code-server"
  description: string;     // "在实例上安装 VS Code Web 版"
  icon?: string;
  category: "editor" | "runtime" | "tool" | "network" | "database";
  stage: "pre" | "main" | "post";   // 归属阶段
  defaultScript: string;   // 默认命令文本（用户可编辑）
  sortOrder: number;       // 默认执行顺序
  ports?: { port: number; label: string }[];  // 该片段预期暴露的端口（仅提示用）
}
```

### 2.3 用户选择模型

用户对片段的配置是**「选择 + 覆写」**，不是"引用"：

```typescript
export interface SnippetSelection {
  snippetId: string;
  enabled: boolean;
  sortOrder: number;
  script: string;          // 用户编辑后的完整文本（初始 = defaultScript）
  customized: boolean;     // 是否被编辑过（用于 UI 提示"已自定义"）
}
```

**关键**：存的是**用户编辑后的文本**，不是 `snippetId` 的引用。这样：
- 平台更新片段默认值，不影响存量工作区
- 用户改动与平台解耦
- `snippetId` 仅用于回溯来源（UI 显示"基于「安装 code-server」修改"）

### 2.4 内置片段清单（初版）

#### editor 分类

| ID | 名称 | 阶段 | 默认脚本要点 |
|---|---|---|---|
| `code-server` | 安装 code-server | pre | 从 USTC 镜像下载 deb 安装，`--auth none` 起在 8080 |
| `openvscode` | 安装 OpenVSCode Server | pre | 从 GitHub release 下载 tar，起在 3000 |
| `jupyter` | 安装 JupyterLab | pre | `pip install jupyterlab`，起在 8888 |

#### runtime 分类

| ID | 名称 | 阶段 | 默认脚本要点 |
|---|---|---|---|
| `nodejs` | 安装 Node.js | pre | npmmirror 二进制包 + 设 registry |
| `python3` | 安装 Python 3 | pre | apt 安装 + 配 pypi 清华源 |
| `go` | 安装 Go | pre | 下载 tar 解压到 /usr/local |
| `java` | 安装 JDK | pre | apt 安装 openjdk-17 |

#### tool 分类

| ID | 名称 | 阶段 | 默认脚本要点 |
|---|---|---|---|
| `docker` | 安装 Docker | pre | USTC 镜像源 + daemon.json 加速 |
| `git-clone` | 克隆代码仓库 | pre | `git clone -b <branch> <url> /workspace` |
| `nginx` | 安装 Nginx | pre | apt 安装 + 静态站点配置 |

#### network 分类

| ID | 名称 | 阶段 | 默认脚本要点 |
|---|---|---|---|
| `docker-mirror` | 配置 Docker 加速 | pre | 写 `daemon.json` 的 `registry-mirrors` |
| `acr-login` | 登录阿里云 ACR | pre | RAM Role STS + `docker login` |
| `npm-mirror` | 配置 npm 镜像 | pre | `npm config set registry` |

#### database 分类

| ID | 名称 | 阶段 | 默认脚本要点 |
|---|---|---|---|
| `postgres` | 启动 PostgreSQL | main | `docker run -p 5432:5432 -e POSTGRES_PASSWORD=...` |
| `redis` | 启动 Redis | main | `docker run -p 6379:6379` |
| `mysql` | 启动 MySQL | main | `docker run -p 3306:3306` |

> **片段 vs 模板的关系**：片段是"积木"，模板是"成品方案"。模板 = 一组预设勾选的片段 + 参数化。用户可以从模板开始，然后自由增删片段。

### 2.5 片段与阶段的合成

最终 `startup.sh` 的结构：

```bash
#!/bin/bash

# === 0. 环境准备（平台固定） ===
{{PROXY_BOOTSTRAP}}
export HOME=/root
export PATH=...
apt-get update -qq
apt-get install -y -qq curl jq git ca-certificates

# === 1. 阶段: pre ===
echo "[phase] pre"
{{SNIPPETS_PRE}}          # 勾选的 pre 片段，按 sortOrder
{{CUSTOM_PRE}}            # 用户自定义的 pre 脚本

# === 2. 阶段: main ===
echo "[phase] main"
{{SNIPPETS_MAIN}}
{{CUSTOM_MAIN}}

# === 3. 阶段: post ===
echo "[phase] post"
{{SNIPPETS_POST}}
{{CUSTOM_POST}}

# === 4. 端口兜底（平台固定） ===
if [ ! -f /opt/agent/ports.json ]; then
  cat > /opt/agent/ports.json <<'EOF'
[{"port":8080,"label":"默认端口","protocol":"http"}]
EOF
fi

echo "[startup] All phases completed."
```

**失败处理**（`onError`）由 agent 负责，不写在 startup.sh 里——因为 `set -e` 会让脚本直接退出，无法执行后续清理。agent 捕获退出码后单独执行 `onError` 脚本。

> **重要**：`startup.sh` 顶部**不能**用 `set -e`，否则无法精确定位失败阶段。改为 agent 逐阶段执行，各自判断退出码。

**方案调整**：不要让 startup.sh 顺序执行三个阶段，而是**由 agent 分别执行三段脚本**：

| agent 执行 | 脚本路径 | 失败行为 |
|---|---|---|
| 1 | `/opt/agent/scripts/pre.sh` | 失败 → 跑 onError → 上报失败 |
| 2 | `/opt/agent/scripts/main.sh` | 同上 |
| 3 | `/opt/agent/scripts/post.sh` | 同上 |
| 4（失败时） | `/opt/agent/scripts/onerror.sh` | 记录日志，不阻断 |

这样每个阶段的失败都能被精确捕获和上报。

---

## 三、模板场景矩阵

### 3.1 设计原则

模板要覆盖**"用户想干什么"**，而不是"用什么技术"。按**产出物**分类：

| 类别 | 用户意图 | 模板 |
|---|---|---|
| A. 跑一个现成容器 | "我有个镜像，帮我跑起来" | `docker-image` |
| B. 部署代码仓库 | "我有代码，帮我跑起来" | `web-app` / `static-site` |
| C. 只要一台空机器 | "我自己写脚本" | `blank` |
| D. 要个数据库 | "我要个可连的数据库" | `database` |
| E. 完整开发环境 | "我要能写代码的环境" | `dev-env` |

### 3.2 具体模板

#### A. `docker-image` — 跑现成容器

| 参数 | 类型 | 默认 | 必填 |
|---|---|---|---|
| `image` | string | — | ✅ |
| `hostPort` | number | 8080 | ✅ |
| `containerPort` | number | 80 | ✅ |
| `env` | key-value[] | [] | ❌ |
| `volumes` | key-value[] | [] | ❌ |
| `command` | string | — | ❌ |
| `restart` | boolean | true | ❌ |
| `autoInstallDocker` | boolean | true | ❌ |

**预设勾选片段**：`docker`（若 `autoInstallDocker`）
**生成脚本**：`docker run -d --name app -p {hostPort}:{containerPort} {env} {volumes} {image} {command}`
**暴露端口**：`[{port: hostPort, label: "App", protocol: "http"}]`

**覆盖场景**：nginx、WordPress、Gitea、MinIO、Jupyter 官方镜像等一切"现成镜像即服务"。

#### B. `web-app` — 部署代码仓库

| 参数 | 类型 | 默认 | 必填 |
|---|---|---|---|
| `repoUrl` | string | — | ✅ |
| `branch` | string | main | ❌ |
| `runtime` | select | node / python / go / java | ✅ |
| `installCmd` | string | 按 runtime 预填 | ❌ |
| `buildCmd` | string | 按 runtime 预填 | ❌ |
| `startCmd` | string | 按 runtime 预填 | ✅ |
| `port` | number | 3000 | ✅ |
| `envFile` | string | — | ❌ |

**预设勾选片段**：`git-clone` + 按 runtime 的片段（`nodejs`/`python3`/`go`/`java`）
**暴露端口**：`[{port, label: "Web", protocol: "http"}]`

**覆盖场景**：GitHub 上的 Node/Python/Go/Java Web 项目一键部署。

#### C. `static-site` — 静态站点

| 参数 | 类型 | 默认 | 必填 |
|---|---|---|---|
| `repoUrl` | string | — | ✅ |
| `branch` | string | main | ❌ |
| `buildCmd` | string | — | ❌ |
| `outputDir` | string | dist | ❌ |
| `port` | number | 8080 | ✅ |

**预设勾选片段**：`git-clone` + `nginx`
**暴露端口**：`[{port, label: "Site", protocol: "http"}]`

**覆盖场景**：Vite/Next.js 静态导出、Hugo、文档站。

#### D. `database` — 可连的数据库

| 参数 | 类型 | 默认 | 必填 |
|---|---|---|---|
| `engine` | select | postgres / mysql / redis / mongodb | ✅ |
| `version` | string | 按 engine | ❌ |
| `port` | number | 按 engine | ✅ |
| `password` | string | 自动生成 | ❌ |

**预设勾选片段**：`docker` + 对应 engine 片段
**暴露端口**：`[{port, label: engine, protocol: "tcp"}]`

**覆盖场景**：远程开发时连一个自己的数据库。

#### E. `dev-env` — 完整开发环境

| 参数 | 类型 | 默认 | 必填 |
|---|---|---|---|
| `editor` | select | code-server / openvscode / none | ✅ |
| `runtime` | multi-select | node / python / go / java | ❌ |
| `repoUrl` | string | — | ❌ |
| `branch` | string | main | ❌ |
| `editorPort` | number | 8080 | ✅ |

**预设勾选片段**：`editor` 对应片段 + runtime 片段 + `git-clone`
**暴露端口**：`[{port: editorPort, label: "IDE", protocol: "http"}]`

**覆盖场景**：原"类 Codespaces"意图，降级为模板之一。

#### F. `blank` — 空机器

**参数**：无
**预设片段**：无
**暴露端口**：默认 8080
**覆盖场景**：完全自定义脚本的用户。

### 3.3 参数类型系统

定义完整的参数类型（回答 Q4）：

```typescript
export type ParamType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "keyvalue";      // 数组类型：键值对列表（env / volumes）

export interface TemplateParam {
  key: string;
  label: string;
  type: ParamType;
  default?: unknown;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];  // select / multiselect
  min?: number;                                   // number
  max?: number;                                   // number
  keyPattern?: string;                            // keyvalue 的 key 校验正则
  itemLabel?: [string, string];                   // keyvalue 两项的标题，如 ["键","值"]
}
```

`keyvalue` 类型解决了 env / volumes / labels 等**重复结构**的表达，前端渲染成可增删的行。

### 3.4 模板与片段的数据流

```
用户选模板 `docker-image`
  → 填参数 { image: "nginx", hostPort: 8080, ... }
  → 系统生成"初始配置"：
      {
        templateId: "docker-image",
        templateParams: {...},
        snippets: [
          { snippetId: "docker", enabled: true, script: "<默认Docker安装脚本>", ... }
        ],
        customScripts: [],
        mainScript: "<由模板 render 生成的 docker run 命令>"
      }
  → 用户在 UI 上可：
      - 增删片段（勾选"安装 code-server"）
      - 展开编辑任一片段的脚本
      - 编辑主脚本
  → 保存 → 存入 workspaces.{template_id, template_params, startup_script}
```

**关键**：模板只负责**生成初始值**，用户后续所有编辑都落在快照上，不再回写模板。

---

## 四、脚本编辑能力边界（回答你的核心问题）

### 4.1 三种可能的模型

| 模型 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| **A. 单一脚本文件** | 工作区只有一个 `startup.sh` 文本框 | 极简，实现快；用户心智负担低 | 长脚本难维护；无法表达阶段；无语法高亮外的辅助 |
| **B. 固定多阶段（4 个文件）** | `pre.sh` / `main.sh` / `post.sh` / `onerror.sh` | 阶段语义清晰；与生命周期对齐；失败可定位 | 用户需要理解"该写哪个"；简单场景显得啰嗦 |
| **C. 完整工作区多文件** | 任意多文件，含目录树、多脚本、配置文件 | 最灵活，可写 `docker-compose.yml`、`.env`、配置模板 | 实现成本高（需要一个"文件树"数据模型 + 编辑器）；偏离"脚本编排"定位，趋向于"在线 IDE" |

### 4.2 我的建议：**B + 受控的 C**

**主模型用 B（4 个固定阶段）+ 片段扩展**，理由：

1. **与生命周期天然对齐**——`pre`/`main`/`post`/`onError` 就是执行模型，不需要额外抽象
2. **片段机制已经提供"横向扩展"**——用户要加"安装 code-server"，是勾一个片段而不是新开一个文件
3. **失败定位精确**——agent 逐阶段执行，日志按阶段分组
4. **实现成本可控**——DB 存 4 个 TEXT 字段即可

**但需要 C 的一小部分能力**：**附件文件（Attachment）**

有些场景必须有配置文件，例如：
- 数据库模板需要 `init.sql`
- Nginx 模板需要 `nginx.conf`
- 应用需要 `.env`

**方案**：在 4 个脚本之外，提供**附件区**，允许添加最多 N 个小文件：

```typescript
export interface ScriptAttachment {
  path: string;      // 写入实例的绝对路径，如 /opt/app/nginx.conf
  content: string;
  mode?: string;     // 文件权限，如 "0644"
}
```

执行前，agent 先把所有附件写到对应路径，再跑脚本。

**这样既保持了"脚本为主"的简洁，又覆盖了"需要配置文件"的常见场景，而不用引入完整的多文件工程模型。**

### 4.3 编辑器的实现程度

| 能力 | 建议 | 理由 |
|---|---|---|
| 纯 textarea | ❌ 不够 | Shell 脚本没有高亮很难写 |
| CodeMirror 6 + shell 语法高亮 | ✅ **推荐** | 体积可控，支持 shell 高亮、行号、括号匹配 |
| 完整 Monaco（VS Code 内核） | ⚠️ 可选升级 | 功能最强但体积大（~5MB），初期不必 |
| 自动补全 shell 命令 | ❌ 过度 | 收益低，成本高 |
| 脚本校验（shellcheck 语法检查） | ✅ 建议 | 保存前跑 `shellcheck` WASM 版，能显著降低用户低级错误 |

**推荐组合**：CodeMirror 6 + shell 高亮 + shellcheck 校验 + 变量提示（提示 `ports.json` 路径等平台约定）。

### 4.4 脚本编辑区的完整 UI 结构

```
┌─ 脚本编排 ────────────────────────────────────────────┐
│                                                       │
│  片段库（可勾选）                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ [✓] 安装 code-server          [展开编辑 ▾]       │  │
│  │     └─ 展开后：CodeMirror 编辑区（默认脚本）      │  │
│  │ [ ] 安装 Docker               [展开编辑 ▾]       │  │
│  │ [✓] 安装 Node.js              [展开编辑 ▾]       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── 阶段 1：pre（执行前）────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ CodeMirror 编辑区（自定义 pre 脚本）             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── 阶段 2：main（主任务）──────────────────────────  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ CodeMirror 编辑区                                │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── 阶段 3：post（收尾）────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ CodeMirror 编辑区                                │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── 阶段 4：onError（失败清理）──────────────────────  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ CodeMirror 编辑区（留空则只记录日志）            │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── 附件文件 ────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ /opt/app/nginx.conf    [编辑] [删除]             │  │
│  │ + 添加附件                                       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── 暴露端口 ────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 自动检测：读取脚本中的 ports.json 写入            │  │
│  │ 或手动指定：[8080] [3000] [+]                    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  [预览完整 startup.sh]  [校验]  [保存]                │
└───────────────────────────────────────────────────────┘
```

### 4.5 数据库模型（最终版）

```sql
-- workspaces：脚本编排快照
ALTER TABLE workspaces ADD COLUMN template_id TEXT;
ALTER TABLE workspaces ADD COLUMN template_params JSONB DEFAULT '{}';

-- 四个阶段脚本（快照，启动时直接用）
ALTER TABLE workspaces ADD COLUMN script_pre TEXT DEFAULT '';
ALTER TABLE workspaces ADD COLUMN script_main TEXT DEFAULT '';
ALTER TABLE workspaces ADD COLUMN script_post TEXT DEFAULT '';
ALTER TABLE workspaces ADD COLUMN script_onerror TEXT DEFAULT '';

-- 片段选择（含用户编辑后的文本）
ALTER TABLE workspaces ADD COLUMN snippet_selections JSONB DEFAULT '[]';
-- [{ snippetId, enabled, sortOrder, script, customized }]

-- 附件文件
ALTER TABLE workspaces ADD COLUMN script_attachments JSONB DEFAULT '[]';
-- [{ path, content, mode }]

-- 暴露端口（手动指定，可选；为空则由脚本 ports.json 决定）
ALTER TABLE workspaces ADD COLUMN declared_ports JSONB DEFAULT '[]';

-- 调试模式（预留）
ALTER TABLE workspaces ADD COLUMN debug_mode BOOLEAN DEFAULT FALSE;

-- imageUri 改为可选（新定位下多数模板不需要）
ALTER TABLE workspaces ALTER COLUMN image_uri DROP NOT NULL;

-- instances：运行时暴露端口
ALTER TABLE instances ADD COLUMN exposed_ports JSONB DEFAULT '[]';
```

### 4.6 `startup.sh` 模板（最终版）

```bash
#!/bin/bash
# 不设 set -e：失败定位由 agent 逐阶段判断

# === 平台固定：环境准备 ===
{{PROXY_BOOTSTRAP}}
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
mkdir -p /workspace /opt/agent/scripts

apt-get update -qq
apt-get install -y -qq curl jq git ca-certificates

# === 平台固定：写入附件文件 ===
{{ATTACHMENTS_WRITE}}

# === 平台固定：写入阶段脚本 ===
cat > /opt/agent/scripts/pre.sh <<'PRE_EOF'
{{SNIPPETS_PRE}}
{{CUSTOM_PRE}}
PRE_EOF
chmod +x /opt/agent/scripts/pre.sh

cat > /opt/agent/scripts/main.sh <<'MAIN_EOF'
{{SNIPPETS_MAIN}}
{{CUSTOM_MAIN}}
MAIN_EOF
chmod +x /opt/agent/scripts/main.sh

cat > /opt/agent/scripts/post.sh <<'POST_EOF'
{{SNIPPETS_POST}}
{{CUSTOM_POST}}
POST_EOF
chmod +x /opt/agent/scripts/post.sh

cat > /opt/agent/scripts/onerror.sh <<'ERR_EOF'
{{CUSTOM_ONERROR}}
ERR_EOF
chmod +x /opt/agent/scripts/onerror.sh

echo "[startup] Stage scripts prepared."
```

**agent 侧执行逻辑**（`agent/main.go`）：

```go
stages := []struct{ Name, Path string }{
    {"pre",  "/opt/agent/scripts/pre.sh"},
    {"main", "/opt/agent/scripts/main.sh"},
    {"post", "/opt/agent/scripts/post.sh"},
}

for _, st := range stages {
    r.ReportStatus(st.Name, fmt.Sprintf("executing %s", st.Name))
    if err := exec.RunStage(st.Path); err != nil {
        // 执行 onError
        r.ReportStatus("on_error", "running error handler")
        exec.RunStage("/opt/agent/scripts/onerror.sh")  // 忽略其结果

        r.ReportError(fmt.Sprintf("stage %s failed: %v", st.Name, err), st.Name)
        return   // 不再继续后续阶段
    }
}

// 全部成功 → 读取 ports.json → 上报就绪
```

> **注意**：空脚本（只有注释）不应视为失败。`RunStage` 需先判断文件是否为空或仅含注释。

### 4.7 调试模式（预留设计）

用户（Q5）要求"失败就销毁，单独开调试模式"。预留设计：

| 项 | 行为 |
|---|---|
| 触发 | 工作区上开关 `debug_mode = true` |
| 失败行为 | **不销毁**，实例保持 RUNNING，`status` 标记为 `DEBUG_HOLD` |
| 保留时长 | 30 分钟（可配），超时后自动销毁（防泄漏） |
| 交互 | 提供"重新执行脚本"按钮 → 调 agent `/command` 的 `retry_script` |
| 访问 | 可 SSH 或通过安全组临时放行 |
| 计费提示 | UI 显著提示"调试模式实例不会自动释放，持续计费中" |

**agent 侧已支持**：`api/server.go:252` 已有 `retry_script` 动作。需要新增的是 `run_stage(stage)` 动作以支持单阶段重跑。

---

## 五、改动清单汇总

| 文件 | 改动 |
|---|---|
| `agent/executor/runner.go` | 新增 `RunStage(path)`、`GetExposedPorts()`、`clearExposedPorts()`；阶段执行前上报 phase |
| `agent/main.go` | 改为逐阶段执行；补 `ReportReady()` 调用（修复 P0 缺陷）；获取公网 IP |
| `agent/reporter/reporter.go` | `ReadyPayload` 增加 `ports`；`ReportReady` 签名增加 ports 参数 |
| `agent/heartbeat/manager.go` | 心跳携带 `publicIp`（兜底） |
| `agent/api/server.go` | `run_stage` 动作（调试模式用） |
| `scripts/startup.sh` | 重写为"环境准备 + 附件写入 + 阶段脚本写入" |
| `scripts/entrypoint.sh` | agent 下载改走 OSS 内网 |
| `src/lib/templates/` | 新建：6 个模板 + 参数类型系统 |
| `src/lib/snippets/` | 新建：20+ 内置片段 |
| `src/lib/userdata.ts` | `EntrypointVars` 扩展 |
| `src/app/api/instance-scripts/startup/route.ts` | 注入片段/阶段/附件；移除 devcontainer 逻辑 |
| `src/app/api/instances/[id]/agent-ready/route.ts` | 接收 `ports`，写 `exposedPorts`，同步访问码 |
| `src/app/api/instances/[id]/agent-status/route.ts` | 无需改（已支持 bootPhase） |
| `src/app/api/templates/route.ts` | 新建 |
| `src/app/api/snippets/route.ts` | 新建 |
| `src/app/api/workspaces/route.ts` | 接受新字段 |
| `src/lib/db/schema.ts` | 见 §4.5 |
| `src/components/instances/instance-detail.tsx` | 替换 `BOOT_PHASES` |
| `src/app/(access)/access/[instanceId]/page.tsx` | 多端口入口展示 |
| 新建工作区向导 | 模板选择 + 片段勾选 + 4 阶段编辑 + 附件 |

---

## 六、实施顺序（修订）

| 阶段 | 内容 | 优先级 | 依赖 |
|---|---|---|---|
| **Phase 1** | 修 `ReportReady` P0 缺陷（agent 补调用 + 元数据取 IP） | **P0** | 无 |
| **Phase 2** | 四阶段执行模型（agent `RunStage` + phases 上报） | **P0** | Phase 1 |
| **Phase 3** | ports.json 契约 + `exposedPorts` + 前端多入口 | **P0** | Phase 1 |
| **Phase 4** | 片段库（`src/lib/snippets/`）+ 20 个内置片段 | P1 | Phase 2 |
| **Phase 5** | 模板引擎（`src/lib/templates/`）+ 6 个模板 | P1 | Phase 4 |
| **Phase 6** | `startup.sh` 重写 + `startup/route.ts` 注入逻辑 | P1 | Phase 2,3 |
| **Phase 7** | 工作区向导 UI（模板 → 片段 → 4 阶段编辑 + 附件） | P1 | Phase 5,6 |
| **Phase 8** | 附件文件机制 | P2 | Phase 6 |
| **Phase 9** | agent 二进制走 OSS | P2 | 无 |
| **Phase 10** | 调试模式 | P3 | Phase 2 |
| **Phase 11** | 文档同步（修订 PLAN/ARCHITECTURE/INSTANCE-PLAN） | P3 | 全部 |

---

## 七、仍需你确认

| # | 问题 | 影响 |
|---|---|---|
| N1 | **片段和 4 阶段的关系**：片段按 `stage` 归属自动落到对应阶段——这个模型你认可吗？还是希望片段全部在 pre 阶段？ | 决定片段数据结构 |
| N2 | **附件文件**是否要限制数量和总大小？建议 20 个 / 单个 64KB | 防滥用 |
| N3 | **模板的 `declared_ports` 与脚本 `ports.json` 冲突时以谁为准**？建议「脚本为准，declared_ports 仅作 UI 提示与无脚本时的兜底」 | 决定优先级逻辑 |
| N4 | 是否需要"**模板市场**"（用户间共享）？我理解不需要（定位是个人自部署） | 决定是否做分享链路 |
| N5 | 编辑器用 **CodeMirror 6** 可以吗？（若你想要 Monaco 我就按 Monaco 设计） | 前端依赖 |
| N6 | **6 个模板够吗**？有没有你明确想要的场景没覆盖？（如：定时任务机器、爬虫、AI 推理服务） | 决定模板清单 |
