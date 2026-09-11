# MeterSpace 模板方案（实施手册）

> 版本：v4.0
> 日期：2026-09-11
> 部署约束：**Vercel 免费版 serverless** —— 后端无法驻留轮询，无定时任务
>
> **本文件是唯一实施依据。** 其他 `docs/*.md` 已移入 `docs/archive/`，作废。
>
> 文中 `路径:行号` 引用均已对照 2026-09-11 的代码核实。**开工前先读第 16 章「开工前准备」。**

---

## 第 0 章 决策表

| # | 决策 | 结论 |
|---|---|---|
| **D1** | DEVCONTAINER 执行方式 | 走官方 `devcontainer` CLI（`devcontainer up`）。features / 镜像拉不到 → 用户自己改 `devcontainer.json` |
| **D2** | `docker-compose.yml` 作为 entry | 支持，agent 调 `docker compose up -d` |
| **D3** | 载荷大小上限 | 单文件 128KB / 200 文件 / 总 2MB，存 DB |
| **D4** | CLI / Node 到实例的方式 | 放 `public/` 静态资源，实例启动时从后端拉 |
| **D5** | 启动超时处理 | 后端释放整台实例 |
| **D6** | 端口开放策略 | 安全组 `1/65535` 全开，源 IP 由 `/access` 逐个加白名单 |
| **D7** | `activity.ports` 用途 | 给前端生成快捷入口按钮 |
| **D8** | serverless 的时序机制 | 无轮询、无定时任务。**前端触发懒处理 + agent 推送**，见第 10 章 |

---

## 第 1 章 核心模型

```
模板 = 元数据 JSON（表单 + 端口声明 + 探活声明） + 载荷（脚本 / devcontainer.json / Dockerfile）
```

| 关注点 | 归属 |
|---|---|
| 表单定义（`params`） | 元数据 |
| 快捷入口按钮（`activity.ports`） | 元数据 |
| 空闲销毁时长（`activity.idleMinutes`） | 元数据 |
| 入口文件（`entry`） | 元数据 |
| 脚本内容 / 镜像 / 装什么软件 | 载荷 |

### 1.1 完整流程

```
① 创建模板
   ├── 写元数据（id / name / params / entry / activity）
   └── 提供载荷（脚本文件 / devcontainer.json / Dockerfile）

② 从模板创建实例
   ├── 填表单（由 params 生成）
   └── 点启动
       └── 后端渲染 {{key}} → 写 workspace_payloads（参数值 + 载荷一起绑定到工作区）

③ 实例启动
   ├── agent 拉载荷文件数组 → 落盘 → 执行 entry
   └── agent 上报就绪（POST /agent-ready）

④ 用户点按钮 → /access/<code>
   ├── 验证访问码
   ├── 把访问者 IP 加进安全组白名单
   └── 展示端口按钮 → 点击直连 http://<ip>:<port>

⑤ 空闲 → 前端下次打开页面触发回收（第 10 章）
```

---

## 第 2 章 元数据 JSON Schema

### 2.1 完整示例

```json
{
  "id": "python-script",
  "name": "Python 脚本服务",
  "description": "上传自己的脚本，实例启动后自动运行",
  "category": "web",
  "icon": "python",
  "tags": ["python", "裸机"],

  "params": [
    { "key": "repo", "label": "Git 仓库", "type": "string",
      "required": true, "placeholder": "https://github.com/me/app.git" },
    { "key": "port", "label": "服务端口", "type": "number",
      "default": 8000, "min": 1024, "max": 65535 },
    { "key": "installDeps", "label": "安装依赖", "type": "boolean", "default": true },
    { "key": "mode", "label": "运行模式", "type": "select", "default": "dev",
      "options": [
        { "value": "dev", "label": "开发" },
        { "value": "prod", "label": "生产" }
      ] },
    { "key": "extraCmd", "label": "附加命令", "type": "text", "default": "" }
  ],

  "entry": "run.sh",

  "activity": {
    "ports": [
      { "port": 8000, "label": "API", "protocol": "http" }
    ],
    "idleMinutes": 30,
    "sampleIntervalSec": 30
  },

  "timeout": 1800
}
```

### 2.2 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 唯一标识，`^[a-z0-9][a-z0-9-]{1,63}$` |
| `name` | string | ✅ | 展示名，≤ 32 字符 |
| `description` | string | ❌ | 一句话，≤ 120 字符 |
| `category` | enum | ❌ | `container` / `web` / `database` / `dev-env` / `ai` / `toolchain` / `blank` |
| `icon` | string | ❌ | 图标名，前端映射；缺省按 category |
| `tags` | string[] | ❌ | 检索用，≤ 8 个 |
| `params` | Param[] | ❌ | 表单字段定义，可空数组 |
| `entry` | string | ✅ | 载荷内入口文件路径 |
| `activity` | object | ❌ | 探活 + 端口声明 |
| `timeout` | number | ❌ | 入口执行超时（秒），默认 1800，上限 3600 |

### 2.3 `params`

```typescript
interface Param {
  key: string;              // {{key}} 引用名，^[a-zA-Z_][a-zA-Z0-9_]*$
  label: string;            // 表单标签
  type: "string" | "text" | "number" | "boolean" | "select";
  default?: string | number | boolean;
  required?: boolean;
  placeholder?: string;     // string / text 用
  min?: number;             // number 用
  max?: number;             // number 用
  options?: { value: string; label: string }[];   // select 必填
}
```

| type | 控件 | 值类型 | 额外字段 |
|---|---|---|---|
| `string` | 单行输入 | string | `placeholder` |
| `text` | 多行文本域 | string | `placeholder` |
| `number` | 数字输入 | number | `min` / `max` |
| `boolean` | 开关 | boolean | — |
| `select` | 下拉 | string | `options`（必填） |

只有这 5 种。密钥用 `string`；多组键值用 `text` 按行填，脚本里自己解析。

### 2.4 `entry`

`entry` 是载荷内的相对路径，平台行为取决于文件本身：

| `entry` 指向 | 平台行为 | 实现 |
|---|---|---|
| `*.sh` | `bash <file>` | §5.1 |
| `devcontainer.json` | `devcontainer up --workspace-folder .` | §5.2 |
| `docker-compose.yml` | `docker compose up -d` | §5.3 |
| 其他扩展名 | 报错 | — |

### 2.5 `activity`

```json
"activity": {
  "ports": [
    { "port": 8000, "label": "API", "protocol": "http" },
    { "port": 3000, "label": "Web 前端", "protocol": "http" }
  ],
  "idleMinutes": 30,
  "sampleIntervalSec": 30
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `ports` | 空 | ① 前端快捷按钮；② 活跃探测扫描的端口 |
| `idleMinutes` | 30 | 空闲多久判定为闲 |
| `sampleIntervalSec` | 30 | 采样间隔 |

```typescript
interface PortDecl {
  port: number;                    // 1-65535
  label?: string;                  // 默认 "端口 {port}"
  protocol?: "http" | "tcp";       // 默认 http
  private?: boolean;               // true = 不生成快捷按钮
}
```

---

## 第 3 章 载荷

### 3.1 数据模型

```sql
-- 工作区载荷（用户可逐文件编辑）
CREATE TABLE workspace_payloads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,              -- 相对路径，如 run.sh / scripts/setup.py
  content      TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL DEFAULT '0644',
  size         INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, path)
);
CREATE INDEX idx_workspace_payloads_ws ON workspace_payloads(workspace_id);

-- 模板（含自带载荷，只读配方）
CREATE TABLE templates (
  id            TEXT PRIMARY KEY,          -- slug
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = 平台内置
  name          TEXT NOT NULL,
  definition    JSONB NOT NULL,            -- 元数据 JSON（§2）
  payload       JSONB NOT NULL DEFAULT '[]',  -- [{path, content, mode, size}]
  version       TEXT DEFAULT '1',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

模板载荷用 `payload` JSONB 整包存；工作区载荷用独立表逐文件存。

### 3.2 载荷结构

**COMMAND 型**：

```
run.sh                  ← entry 指向它
scripts/setup.py
files/nginx.conf
```

**DEVCONTAINER 型**：

```
devcontainer.json       ← entry 指向它
Dockerfile
.dockerignore
```

**devcontainer 布局兼容**（`devcontainer up --workspace-folder <dir>` 在 `<dir>/.devcontainer/devcontainer.json` 找配置）：

| 载荷里的位置 | agent 处理 |
|---|---|
| 根目录 `devcontainer.json` | 落盘时挪到 `/opt/ws/.devcontainer/devcontainer.json` |
| `.devcontainer/devcontainer.json` | 直接用 |

### 3.3 限制与校验

| 项 | 限制 | 校验时机 |
|---|---|---|
| 单文件 | 128 KB | 上传前 + 保存时 |
| 文件总数 | 200 | 同上 |
| 总大小 | 2 MB | 同上 |
| 路径 | 禁绝对路径、禁 `..`、深度 ≤ 6、字符集 `[A-Za-z0-9._/-]` | 服务端保存时 |
| 二进制 | 不支持（文本模型） | 上传时检测 |

### 3.4 上传路径

```
方式 A：zip 上传
  前端 multipart 上传 zip
    ↓ 后端解包 + 校验（zip slip 在后端做）
    ↓ 拆成 [{path, content, mode}]
    ↓ 存 workspace_payloads / templates.payload

方式 B：逐文件提交
  前端文件树编辑器 POST /api/workspaces/{id}/payload
    body: { path, content, mode }
    ↓ 单文件 upsert
```

zip slip 防护（后端解包时逐条校验）：

```typescript
for (const entry of zip.getEntries()) {
  const target = path.resolve(tmpDir, entry.entryName);
  if (!target.startsWith(tmpDir + path.sep)) {
    throw new Error(`zip slip: ${entry.entryName}`);
  }
  if (entry.attr & 0xa000) {   // symlink
    throw new Error(`symlink not allowed: ${entry.entryName}`);
  }
}
```

### 3.5 agent 拉取载荷

```
GET /api/instances/{id}/payload   (token 鉴权)
  ↓
{ "entry": "run.sh", "workspace": "/opt/ws", "vars": {},
  "files": [{ "path": "run.sh", "content": "...", "mode": "0755", "size": 1234 }, ...] }
  ↓
逐个落盘到 /opt/ws/，设置权限
```

agent 侧落盘：

```go
for _, f := range resp.Files {
    abs := filepath.Join("/opt/ws", f.Path)
    os.MkdirAll(filepath.Dir(abs), 0755)
    os.WriteFile(abs, []byte(f.Content), mustParseMode(f.Mode))
}
```

agent 二进制下载通道复用：`entrypoint.sh:32` 从 `${CALLBACK_URL}/agent-linux-${ARCH}` 拉 agent，CLI bundle 走同一条路（§5.2）。

---

## 第 4 章 参数渲染

### 4.1 时机与范围

**渲染在后端，不在 agent。**

```
用户填参数 → POST /api/templates/[id]/instantiate
  ↓
取模板载荷数组 → 逐个文件做 {{key}} 替换 → 写 workspace_payloads
  ↓
（实例启动后）agent 拉已渲染好的文件数组 → 落盘 → 执行 entry
```

只渲染 `entry` 指向的那一个文件，载荷里其他文件原样入库。

### 4.2 替换规则

| 规则 | 做法 |
|---|---|
| 语法 | `{{key}}`，key 取自 `params` |
| 未定义的 key | 保留原样 |
| shell 转义 | 用户自己加引号：`"{{repo}}"` |

### 4.3 `.json` / `.yml` 做 JSON 转义

```typescript
const escaped = JSON.stringify(value).slice(1, -1);   // 去掉首尾引号
```

| entry 类型 | 转义 |
|---|---|
| `*.sh` | 原样替换 |
| `.json` / `.yml` | JSON 字符串转义 |

### 4.4 渲染示例

元数据：`entry = "run.sh"`，`params = [{key:"repo"}, {key:"port"}]`

载荷 `run.sh`：

```bash
#!/bin/bash
set -e
git clone --depth 1 "{{repo}}" /workspace/app
cd /workspace/app
python3 -m http.server "{{port}}" --bind 0.0.0.0 &
```

用户填 `repo=https://github.com/me/app.git`，`port=8000`

存入 `workspace_payloads` 的内容：

```bash
#!/bin/bash
set -e
git clone --depth 1 "https://github.com/me/app.git" /workspace/app
cd /workspace/app
python3 -m http.server "8000" --bind 0.0.0.0 &
```

---

## 第 5 章 三种 entry 的执行

### 5.1 COMMAND（`entry` 指向 `.sh`）

```
agent:
  1. 从后端拉载荷文件数组 → 逐条落盘到 /opt/ws/
  2. bash <entry>，工作目录 /opt/ws
  3. 注入环境变量（§6）
  4. 等进程结束，或等到超时
  5. 退出码 0 → 成功；非 0 → 失败 → 上报 → 后端释放实例
  6. POST /agent-ready 上报就绪
```

超时处理：

```
脚本执行超过 timeout
  ↓ agent 上报 TIMEOUT
  ↓ 后端 DeleteInstance(ecsInstanceId)     ← 整机销毁
  ↓ 容器 / 后台进程 / 磁盘全部消失
```

agent 侧实现：

```go
ctx, cancel := context.WithTimeout(context.Background(), timeout)
defer cancel()
cmd := exec.CommandContext(ctx, "bash", entryPath)
err := cmd.Run()
if ctx.Err() == context.DeadlineExceeded {
    reportStatus("timeout", ...)
}
```

超时默认 1800s，元数据 `timeout` 可覆盖，上限 3600s。

### 5.2 DEVCONTAINER（`entry` 指向 `devcontainer.json`）

**执行方式：官方 `devcontainer` CLI。**

#### CLI 从 public 拉取

`entrypoint.sh` 现有写法（拉 agent）：

```bash
AGENT_DOWNLOAD_URL="${CALLBACK_URL}/agent-linux-${AGENT_ARCH}"
curl -sfL "${AGENT_DOWNLOAD_URL}" -o /opt/agent/agent
```

CLI 用同样模式：

```bash
CLI_DOWNLOAD_URL="${CALLBACK_URL}/devcontainer-cli.tar.gz"
curl -sfL "${CLI_DOWNLOAD_URL}" -o /tmp/devcontainer-cli.tar.gz
mkdir -p /opt/devcontainer
tar -xzf /tmp/devcontainer-cli.tar.gz -C /opt/devcontainer
ln -sf /opt/devcontainer/devcontainer /usr/local/bin/devcontainer
```

#### 构建 CLI bundle（构建期一次性执行）

```bash
# scripts/build-cli-bundle.sh（新建）
mkdir -p /tmp/dccli && cd /tmp/dccli
npm pack @devcontainers/cli@0.x.x
tar -xzf devcontainers-cli-*.tgz
cd package && npm install --omit=dev --production
tar -czf /path/to/public/devcontainer-cli.tar.gz .
```

CLI 依赖 Node.js：Node 走 `startup.sh:43-64` 的 npmmirror 逻辑，CLI 走 public bundle。

#### agent 侧执行流程

```
agent:
  1. 检查 /usr/local/bin/devcontainer
       ├─ 不存在 → 从后端拉 bundle 解压
       └─ 存在 → 跳过
  2. 从后端拉载荷文件数组 → 落盘
  3. 定位配置：
       根目录 devcontainer.json → 挪到 /opt/ws/.devcontainer/devcontainer.json
       已有 .devcontainer/devcontainer.json → 直接用
  4. cd /opt/ws && devcontainer up --workspace-folder .
  5. POST /agent-ready 上报就绪
```

核心调用：

```go
cmd := exec.Command("devcontainer", "up", "--workspace-folder", "/opt/ws")
cmd.Dir = "/opt/ws"
cmd.Env = append(os.Environ(), envVars...)
out, err := cmd.CombinedOutput()
```

#### 端口

| 事项 | 做法 |
|---|---|
| 安全组 | `1/65535` 全开 + IP 白名单（§7.1） |
| 前端按钮 | 数据源是模板元数据 `activity.ports`（§7.3） |
| 实际端口与元数据不一致 | 用户改元数据，或写 `$WS_EXPOSED_PORTS_FILE` 兜底（§6.2） |

#### 失败处理

| 失败场景 | 平台行为 | 用户解决办法 |
|---|---|---|
| `image` 拉不到 | 报错 + 打印 `docker pull` 原始输出 | 改 `devcontainer.json` 的 `image` 为国内可达镜像（如 ACR 地址） |
| `features` 拉不到（`ghcr.io`） | 报错 + 指出是哪个 feature | 删掉 `features`，改用 `postCreateCommand` 自己 `apt install` |
| `build.dockerfile` 基础镜像拉不到 | 报错 | 改 `Dockerfile` 的 `FROM` |
| CLI 输出其他错误 | 原样透传 CLI 的 stderr | 用户自行排查 |

平台把原始终端输出完整上报到日志（现有 `executor` 日志通道）。

**改法**：移除 `startup.sh:200` 的「devcontainer 失败就退到 host 模式」逻辑，改为直接失败。（该文件随第 13 章 Z2 整体删除。）

#### 镜像加速器（暂缓）

`docker pull` 直接执行，用系统默认源。`settings.dockerMirror` 字段留待后续统一解决注入时机时使用（写入 `/etc/docker/daemon.json` 的 `registry-mirrors`）。不在本轮范围。

### 5.3 COMPOSE（`entry` 指向 `docker-compose.yml`）

```
agent:
  1. 从后端拉载荷文件数组 → 落盘
  2. cd /opt/ws
  3. docker compose -f docker-compose.yml up -d
  4. POST /agent-ready 上报就绪
```

端口来源：模板元数据 `activity.ports`。

---

## 第 6 章 脚本运行环境

### 6.1 环境变量

| 变量 | 值 | 说明 |
|---|---|---|
| `WS_ROOT` | `/opt/ws` | 工作空间根（载荷落盘处） |
| `WS_WORKSPACE` | `/workspace` | 持久化业务数据目录（备份到 OSS） |
| `WS_EXPOSED_PORTS_FILE` | `/opt/agent/ports.json` | 端口声明文件（可选覆盖） |
| `WS_INSTANCE_ID` | UUID | 实例 ID |
| `WS_WORKSPACE_ID` | UUID | 工作区 ID |
| `WS_REGION` | `cn-hangzhou` | 地域 |

`params` 的值只通过 `{{key}}` 渲染进 entry 文件。

### 6.2 端口的两个用途

| | 消费者 | 用途 | 数据源 |
|---|---|---|---|
| A | 前端（主路径） | 快捷入口按钮 | 元数据 `activity.ports` |
| B | agent（可选覆盖） | 实际端口与元数据不一致时覆盖 | `$WS_EXPOSED_PORTS_FILE` |

**A：元数据声明（前端用）**

```json
{
  "activity": {
    "ports": [
      { "port": 8000, "label": "API", "protocol": "http" }
    ]
  }
}
```

创建完成页 / 工作区详情页读它生成按钮：

```
[ 打开 API :8000 ]  [ 打开 前端 :3000 ]
```

按钮链接形如 `/access/<code>?port=8000`（走邀请码路由，点击时才校验来源 IP 并加白名单）。

**B：脚本覆盖（可选）**

```bash
cat > "$WS_EXPOSED_PORTS_FILE" <<'EOF'
[{"port": 9000, "label": "实际服务", "protocol": "http"}]
EOF
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `port` | ✅ | 1-65535 |
| `label` | ❌ | 默认 `端口 {port}` |
| `protocol` | ❌ | `http` / `tcp`，默认 `http` |
| `private` | ❌ | `true` = 不生成快捷按钮 |

回退顺序：脚本文件 → 元数据 `activity.ports` → 都没有则不生成任何按钮。

---

## 第 7 章 端口与访问控制

### 7.1 全端口开放

`src/lib/instances/access.ts` 现有实现直接可用：

```typescript
export const ALL_PORTS = 0;   // 哨兵值：全端口

export function toPortRanges(allowedPorts: number[] | null | undefined): string[] {
  if (!allowedPorts || allowedPorts.length === 0) return ["8080/8080"];
  if (allowedPorts.includes(ALL_PORTS)) return ["1/65535"];
  return allowedPorts.map((p) => `${p}/${p}`);
}
```

实例级安全组（`ensureInstanceSecurityGroup()`）创建时：

```
authorizeIngress(creds, region, sgId, "1/65535", sourceIp)
```

`sourceIp` 填逐个已验证的访问者 IP。

**改动**：删除 `ensureRegionResources()` 里的 `authorizeIngress("8080/8080")`（保留 `22/22` 给运维跳板）。

### 7.2 访问者 IP 白名单（邀请码机制）

`src/lib/instances/access.ts` 现有：

```typescript
export async function registerVisitorIp(
  instanceId: string,
  code: string,
  ip: string
): Promise<{ registered: boolean }>
```

完整流程：

```
① 用户拿到访问码链接：https://<platform>/access/<code>
② 浏览器打开 /access/<code>
③ 后端校验 code
④ 后端取请求的 X-Forwarded-For / X-Real-IP → 访问者公网 IP
⑤ registerVisitorIp(instanceId, code, visitorIp)
     ├─ 写 instance_access_codes 记录
     └─ authorizeIngress(sgId, "1/65535", `${visitorIp}/32`)
⑥ 响应页面展示快捷入口按钮 [ 打开 API :8000 ] [ 打开 前端 :3000 ]
⑦ 点击按钮 → 浏览器直连 http://<instanceIp>:<port>
```

白名单随实例销毁一起消失（SG 一并删除）。

### 7.3 元数据端口只给前端

| | 元数据 `activity.ports` | 安全组 |
|---|---|---|
| 谁用 | 前端 | 后端 |
| 用途 | 渲染快捷按钮 | 决定流量能否进来 |
| 粒度 | 具体端口 + 展示名 | `1/65535` × 访问者 IP |
| 缺失时 | 不显示按钮 | 无影响 |

### 7.4 端口例外

| 端口 | 处理 |
|---|---|
| 22 | SG 里单独一条规则，源 IP 是平台运维段。用户服务占 22 会导致自己连不上，自担风险 |
| 9527 | agent 本地 HTTP API 端口，只监听 `127.0.0.1`，不经过 SG |

`private: true` 表示不生成快捷按钮（SG 是全开）。

**无需改动**：`validatePorts()`、`BLOCKED_PORTS`、`instances.exposed_ports` 在当前代码中均不存在，不必查找删除。

### 7.5 实例 IP 来源

**serverless 下不能轮询**。`getInstance()` 改为**按需调用**：谁需要 IP 谁调。

`src/lib/providers/aliyun.ts:157-170` 现成：

```typescript
async getInstance(instanceId: string): Promise<CloudInstance | null> {
  const inst = await ecs.describeInstances(creds, region, instanceId);
  return {
    id: inst.instanceId,
    status: inst.status,
    publicIp: inst.publicIpAddress ?? inst.eipAddress?.ipAddress,   // ★
    // ...
  };
}
```

**调用点：**

| 时机 | 调用方 | 动作 |
|---|---|---|
| `agent-ready` | `agent-ready/route.ts` | 收到就绪 → 调 `getInstance()` → 写 `instances.publicIp` |
| 实例详情页 | `GET /api/instances/[id]` | 若 `publicIp` 为 null → 现场查云厂商 |
| `/access` 访问 | `access/[instanceId]/route.ts` | 同上 |
| 懒处理 | `/api/maintenance` | 顺带补 `publicIp` 为 null 的实例 |

`agent-ready` 是主路径（实例刚起、IP 必已分配），其余是补漏。

---

## 第 8 章 数据模型

### 8.1 变更清单

```sql
-- 新增表见 §3.1（templates / workspace_payloads）

-- workspaces：模板实例
ALTER TABLE workspaces ADD COLUMN template_id TEXT;
ALTER TABLE workspaces ADD COLUMN template_version TEXT;
ALTER TABLE workspaces ADD COLUMN template_params JSONB DEFAULT '{}';
ALTER TABLE workspaces ADD COLUMN entry TEXT;
ALTER TABLE workspaces ADD COLUMN activity_config JSONB;
ALTER TABLE workspaces ADD COLUMN entry_timeout INTEGER DEFAULT 1800;
ALTER TABLE workspaces ALTER COLUMN image_uri DROP NOT NULL;

-- instances：运行时
ALTER TABLE instances ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE instances ADD COLUMN current_entry TEXT;

CREATE INDEX idx_instances_heartbeat ON instances(last_heartbeat_at);
CREATE INDEX idx_instances_idle ON instances(status, last_active_at) WHERE status = 'RUNNING';
```

| 变化 | 说明 |
|---|---|
| 新增 `templates` / `workspace_payloads` | 载荷存 DB |
| `workspaces.image_uri` 设 nullable | 兼容旧模板 |
| `instance_scripts` 表保留 | 避免迁移风险 |

以下字段在当前代码中**不存在**，无需删除：`workspaces.zip_oss_key`、`instances.exposed_ports`。

### 8.2 类型定义

```typescript
// src/lib/templates/types.ts
export type ParamType = "string" | "text" | "number" | "boolean" | "select";

export interface Param {
  key: string;
  label: string;
  type: ParamType;
  default?: string | number | boolean;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}

export interface PortDecl {
  port: number;
  label?: string;
  protocol?: "http" | "tcp";
  private?: boolean;
}

export interface ActivityConfig {
  ports?: PortDecl[];
  idleMinutes?: number;         // 默认 30
  sampleIntervalSec?: number;   // 默认 30
}

export type EntryKind = "command" | "devcontainer" | "compose";

export interface Template {
  id: string;
  name: string;
  description?: string;
  category?: "container" | "web" | "database" | "dev-env" | "ai" | "toolchain" | "blank";
  icon?: string;
  tags?: string[];
  params?: Param[];
  entry: string;
  activity?: ActivityConfig;
  timeout?: number;
}

export function resolveEntryKind(entry: string): EntryKind {
  if (entry.endsWith(".json") && entry.includes("devcontainer")) return "devcontainer";
  if (entry.endsWith(".yml") || entry.endsWith(".yaml")) return "compose";
  if (entry.endsWith(".sh")) return "command";
  throw new Error(`无法识别的 entry: ${entry}`);
}
```

---

## 第 9 章 API

| 路由 | 方法 | 说明 | 状态 |
|---|---|---|---|
| `/api/templates` | GET | 列表（市场 + 内置 + 用户自建合并） | 新建 |
| `/api/templates/[id]` | GET | 详情（含 `params` + `activity.ports`） | 新建 |
| `/api/templates` | POST | 用户自建模板（元数据 + 载荷数组） | 新建 |
| `/api/templates/upload` | POST | 上传 zip → 后端解包 → 存 DB | 新建 |
| `/api/templates/[id]/instantiate` | POST | 校验参数 + 渲染载荷 + 落库 | 新建 |
| `/api/instances/[id]/payload` | GET | agent 拉载荷文件数组 | 新建 |
| `/api/instances/[id]/agent-ready` | POST | 接收 `{token}`，调 `getInstance()` 写 IP，置 RUNNING | 改 |
| `/api/instances/[id]/agent-heartbeat` | POST | 分离心跳与活跃 | 改 |
| `/api/maintenance` | POST | 前端触发：超时 / 心跳缺失 / 空闲三合一 | 新建 |
| `/access/[code]` | GET | 邀请码路由：验码 → 加 IP 白名单 → 展示按钮 | 微调 |
| `/api/git-proxy` | — | 已有 | 保留 |

删除的路由（含已删与无需处理）：

| 路由 | 原因 | 现状 |
|---|---|---|
| `GET /api/cron/idle-release` | Vercel 免费版不支持定时任务 | ✅ 已删 |
| `POST /api/workspaces/[id]/upload`（zip → OSS） | 改为 `/api/templates/upload`（解包存 DB） | ❌ 本就不存在，无需处理 |
| `GET /api/instances/[id]/workspace-zip`（OSS 预签名） | 改为 `/payload` | ❌ 本就不存在，无需处理 |
| `GET /api/instance-scripts/startup` | 工作区由 agent 拉取 | ⚠️ 存在，第 13 章 Z1 删除 |

### 9.1 `instantiate` 流程

```
POST /api/templates/[id]/instantiate
  { "name": "我的工作区", "params": { "repo": "...", "port": 8000 } }

① 取模板定义（市场 → 内置 → 用户自建）
② 动态生成 zod schema 校验 params
     ├─ required 缺失 → 400
     ├─ number 越界 → 400
     ├─ select 值不在 options → 400
     └─ 补 default
③ 落库 workspaces:
     name / region / template_id / template_params / entry /
     activity_config / entry_timeout
④ 渲染载荷 → 写入 workspace_payloads
     遍历 template.payload：
       ├─ .json / .yml / .yaml → {{key}} 做 JSON 转义
       ├─ .sh / 其他文本      → {{key}} 原样替换
       └─ 逐条 INSERT workspace_payloads
⑤ 返回 { workspaceId, needsUpload: false, entry, ports }
```

### 9.2 agent 拉载荷

```
GET /api/instances/{id}/payload
Header: Authorization: Bearer <agent_token>

{
  "entry": "startup.sh",
  "workspace": "/opt/ws",
  "vars": {},
  "files": [
    { "path": "startup.sh",  "content": "...", "mode": "0755", "size": 1234 },
    { "path": "config/app.json", "content": "...", "mode": "0644", "size": 88 }
  ]
}
```

### 9.3 `agent-ready` 改造

```typescript
const bodySchema = z.object({
  token: z.string(),
  agentVersion: z.string().optional(),
});

// 实例刚就绪，IP 必已分配 —— 这里查一次并落库（serverless 下唯一的 IP 主路径）
const cloud = await getInstance(instance.ecsInstanceId, workspace.region);

await db.update(instances).set({
  status: "RUNNING",
  publicIp: cloud?.publicIp ?? null,
  bootCompletedAt: new Date(),
  bootPhase: null,
  lastActiveAt: new Date(),
  lastHeartbeatAt: new Date(),
}).where(eq(instances.id, id));
```

### 9.4 `agent-heartbeat` 改造

```typescript
const updateData: Record<string, unknown> = {
  lastHeartbeatAt: new Date(),
};

if (body.active === true) {
  updateData.lastActiveAt = body.last_active_at
    ? new Date(body.last_active_at)
    : new Date();
  updateData.idleTriggered = false;
}

if (body.resource_usage) { updateData.resourceUsage = body.resource_usage; }
if (body.access_summary) { updateData.accessSummary = body.access_summary; }
if (body.current_entry) { updateData.currentEntry = body.current_entry; }
```

心跳频率 30s，由 agent 主动推送（`entrypoint.sh:52` 已有 `heartbeat_interval`）。

---

## 第 10 章 时序机制（serverless 约束）

### 10.1 约束

| 能力 | 有无 | 说明 |
|---|---|---|
| 常驻进程 | ✗ | 函数执行完即销毁 |
| 后台轮询 | ✗ | 无长生命周期进程可挂 |
| 定时任务 | ✗ | Vercel 免费版不支持 Cron |
| 函数内 sleep 轮询 | ✗ | 有执行时长上限 |
| 按需处理 | ✓ | 任何 HTTP 请求内可做一次同步检查 |

一切时序逻辑都**必须挂在请求上**：有请求才有检查，没有请求就没有检查。

### 10.2 两条时序通道

**通道 1：前端触发（懒处理）** —— 唯一主动通道

前端在页面加载 / 轮询时打一枪维护接口，后端在同一请求内把该做的事做完：

```typescript
// 前端：workspace-list.tsx、workspace-detail.tsx 的 load() 开头
fetch("/api/maintenance", { method: "POST" }).catch(() => {});
```

```typescript
// 后端：src/app/api/maintenance/route.ts
const result = {
  timeout: await checkAndFixTimeouts(userId),  // 启动超时
  stale:   await reapStale(userId),            // 心跳缺失
  idle:    await releaseIdle(userId),          // 空闲释放
};
```

三个任务都以 `userId` 为界，只处理当前用户的数据，单次请求开销可控。

**通道 2：agent 主动上报** —— 实时性来源

agent 是常驻进程（在实例上），负责：

| agent 推什么 | 频率 | 后端动作 |
|---|---|---|
| 心跳（`lastHeartbeatAt`） | 30s | 证明实例活着 |
| `active` + `last_active_at` | 30s | 有人在用 → 刷新 `lastActiveAt` |
| `current_entry` | 状态变化时 | 诊断用 |
| 脚本超时 | 触发时 | `TIMEOUT` → 释放实例 |

### 10.3 闲时销毁闭环

```
agent 每 30s 探测本地端口连接
  ├─ 有活跃连接 → 心跳带 active=true，后端刷 lastActiveAt
  └─ 无活跃连接 → 心跳只更新 lastHeartbeatAt（不刷 lastActiveAt）
        │
        ▼ 前端下次打开页面 / 轮询
        │
POST /api/maintenance → releaseIdle()
        │
        ▼ 判据：now - lastActiveAt >= idleMinutes（默认 30）
        │
stopWorkspace → 备份 /workspace → 停 ECS → STOPPED
```

`releaseIdle()` 是纯数据库判据，不依赖 agent 上报空闲标记，也不需要中间态 `idleTriggered`。

### 10.4 心跳缺失检测

```
扫描 BOOTING / RUNNING 实例
  ├─ BOOTING 且 lastHeartbeatAt 为 null 且创建超过 5 分钟 → FAILED + 销毁
  ├─ BOOTING 且 lastHeartbeatAt 超过 3 分钟 → FAILED + 销毁
  └─ RUNNING 且 lastHeartbeatAt 超过 3 分钟 → 判为假死 → FAILED
```

实现在 `reapStale()`（`src/lib/instances/lifecycle.ts`），由 `/api/maintenance` 触发。

### 10.5 `AutoReleaseTime`

| 机制 | 语义 | 值 |
|---|---|---|
| 闲时销毁 | 不活跃 N 分钟后停止 | `idleMinutes`，默认 30 |
| `AutoReleaseTime` | 安全上限 | `releaseHours`，改为 **12** |

**改法**：`settings.defaultReleaseHours` 当前 `0.5`，改为 `12`。

云厂商侧的 `AutoReleaseTime` 是硬兜底：即使前端一直没打开、懒处理一次都没跑，ECS 也会被自动释放。这是无定时任务下唯一的保底。

### 10.6 状态流转

```
PROVISIONING → BOOTING ──[心跳超时]──→ FAILED → 销毁
                  │
                  │ entry 执行成功 + agent-ready
                  ▼
              RUNNING ◄── agent 心跳（30s）
                  │
                  ├─ 空闲 > idleMinutes
                  │        │
                  │  前端 /api/maintenance → releaseIdle()
                  ▼        ▼
              RELEASING → 备份 /workspace → 停 ECS → STOPPED
```

---

## 第 11 章 agent 实现

### 11.1 活跃探测（新建 `activity/detector.go`）

```go
type Detector struct {
    ports      []int
    interval   time.Duration
    lastActive time.Time
    mu         sync.RWMutex
}

func (d *Detector) sample() {
    active := false
    for _, port := range d.ports {
        if countEstablished(port) > 0 {
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

// 读 /proc/net/tcp 和 /proc/net/tcp6，统计 state==01 且 local_port==port
// 且 local/remote 都不是 127.0.0.1 的条目数
func countEstablished(port int) int { /* 解析 /proc/net/tcp */ }
```

### 11.2 心跳 payload

```go
type HeartbeatPayload struct {
    Token             string                `json:"token"`
    Status            string                `json:"status"`
    Active            bool                  `json:"active"`
    Uptime            int64                 `json:"uptime"`
    LastActiveAt      time.Time             `json:"last_active_at"`
    ScriptStatus      string                `json:"script_status"`
    ScriptError       string                `json:"script_error,omitempty"`
    ResourceUsage     *ResourceUsage        `json:"resource_usage,omitempty"`
    AccessSummary     *access.AccessSummary `json:"access_summary,omitempty"`
    CurrentEntry      string                `json:"current_entry,omitempty"`
}
```

**改法**：`ReadyPayload.PublicIP` 字段删除。

### 11.3 待修复缺陷

| # | 缺陷 | 位置 |
|---|---|---|
| **P0** | `ReportReady()` 零调用 | `agent/reporter/reporter.go:170` |
| **H1** | 心跳无条件刷 `lastActiveAt` | `agent-heartbeat/route.ts:42` |
| **H2** | `active` 字段被计算但后端忽略 | 同上 |
| **H3** | `IsIdle()` 定义但从未调用 | `agent/heartbeat/manager.go:190` |
| **H4** | `idleMinutes` 配置存在但未使用 | `agent/config/config.go:24` |
| **H5** | ECS `AutoReleaseTime` 与闲时语义冲突 | `service.ts:163-165` |
| **H6** | 前端心跳需登录 | `api/health/[wid]/heartbeat` |
| **H8** | `publicIp` 从未落库 | `instances.publicIp` |

（H7 已作废，编号保留不补。）

**已在本轮实现修复的**：H1/H2（`agent-heartbeat` 已改写）、H8（`agent-ready` 待改路径已定）、
`/api/maintenance` 已建。开工时**不要重复实现**，先确认这些是否已落地。

---

## 第 12 章 改动清单

### 12.1 agent（Go）

| 文件 | 改动 |
|---|---|
| `main.go` | 补 `ReportReady()` 调用（现零调用）；`exec.Execute()` 改调 `RunEntry()`；启动活跃探测 |
| `heartbeat/manager.go` | 心跳携带 `LastActiveAt` / `Active` / `CurrentEntry`；启用 `IsIdle` |
| `reporter/reporter.go` | `HeartbeatPayload` 扩展；`ReadyPayload` 删除 `PublicIP`；`ReportReady` 签名收窄为 `(agentVersion)` |
| `executor/runner.go` | `Execute()` 重写为 `RunEntry()`：`exec.CommandContext` 超时；`isBlank` 跳过 |
| `fetcher/fetcher.go` | 新建：拉载荷文件数组（HTTP JSON）+ 逐条 `WriteFile` |
| `activity/detector.go` | 新建：`/proc/net/tcp` 采样 |
| `devcontainer/runner.go` | 新建：`devcontainer up --workspace-folder` |
| `compose/runner.go` | 新建：`docker compose up -d` |
| `config/config.go` | 新增 `WorkspaceRoot` / `Entry` / `EntryTimeout` / `ActivityConfig` |
| `api/server.go` | 新增 `run_entry` 动作（调试用） |

> `agent/render/` 与 `agent/ports/` 目录**不存在**，无需删除。当前 agent 只有 8 个 Go 文件：
> `main.go`、`access/tracker.go`、`api/server.go`、`config/config.go`、`crypto/signature.go`、
> `executor/runner.go`、`heartbeat/manager.go`、`reporter/reporter.go`。

### 12.2 后端（TypeScript）

| 文件 | 改动 |
|---|---|
| `src/lib/db/schema.ts` | §8.1 全部字段 + 新增 `templates` / `workspace_payloads` |
| `src/lib/templates/types.ts` | 新建：`Template` / `Param` / `PortDecl` / `ActivityConfig` / `resolveEntryKind` |
| `src/lib/templates/validate.ts` | 新建：动态 zod 校验 |
| `src/lib/templates/render.ts` | 新建（从 agent 移来）：`{{key}}` 替换 + `.json`/`.yml` JSON 转义 |
| `src/lib/templates/zip.ts` | 新建：解 zip + 校验（zip slip / 128KB / 2MB / 200 文件 / 深度 6）。**需先 `npm i jszip`** |
| `src/lib/templates/builtin/*.json` | 新建：模板定义 |
| `src/lib/marketplace/client.ts` | 加 `getMarketplaceTemplates()` |
| `src/app/api/templates/route.ts` | 新建：列表 + 自建 |
| `src/app/api/templates/[id]/route.ts` | 新建：详情 |
| `src/app/api/templates/upload/route.ts` | 新建：zip → 解包 → 存 DB |
| `src/app/api/templates/[id]/instantiate/route.ts` | 新建：校验 + 渲染载荷 + 写 `workspace_payloads` |
| `src/app/api/instances/[id]/payload/route.ts` | 新建：agent 拉载荷文件数组 |
| `src/app/api/instances/[id]/agent-ready/route.ts` | 改造：接收 `{token}`；调 `getInstance()` 写 `publicIp`；置 RUNNING |
| `src/app/api/instances/[id]/agent-heartbeat/route.ts` | 重写：写 `lastHeartbeatAt`，分离心跳与活跃 |
| `src/lib/instances/lifecycle.ts` | 加 `reapStale()` / `releaseIdle()`（前端触发，§10.2 通道 1） |
| `src/app/api/maintenance/route.ts` | 新建：前端触发三合一（超时 / 心跳 / 空闲） |
| `drizzle/0013_add_instance_heartbeat.sql` | 新建：`instances.last_heartbeat_at` |
| `src/lib/aliyun/ecs.ts` | 新增 `authorizeIngress(..., "1/65535", visitorIp)` 用法 |
| `src/lib/ecs/provisioning.ts` | `ensureRegionResources()` 删 `authorizeIngress("8080/8080")`；`ensureInstanceSecurityGroup()` 改为按访问者 IP 开 `1/65535` |
| `src/app/api/instance-scripts/startup/route.ts` | 删除（现状：**存在**，被 `entrypoint.sh:14` 调用，随 Z1 一起清理） |
| `scripts/startup.sh` | 删除（现状：**存在**，228 行，含 host 回退逻辑） |
| `scripts/entrypoint.sh` | 重写：拉 agent 二进制 + 拉 Node + devcontainer CLI bundle |
| `scripts/build-cli-bundle.sh` | 新建：`@devcontainers/cli` 打包成 tar.gz 放 `public/` |
| `scripts/publish-agent.sh` | 新建：构建上传 agent 二进制 |

### 12.3 前端

| 文件 | 改动 |
|---|---|
| 模板列表页 | 新建：模板卡片 + 分类筛选 |
| 模板详情/表单页 | 新建：由 `params` 生成表单（5 种控件）+ 载荷上传 |
| 模板编辑页 | 新建：写元数据 JSON（带校验）+ 上传 zip |
| 实例详情页 | 替换 `BOOT_PHASES`；展示 `currentEntry` |
| 创建完成页 / 访问页 | 由元数据 `activity.ports` 生成快捷入口按钮 |
| `src/components/instances/instance-detail.tsx` | line 164 `instance.port ?? 8080` 改为读元数据端口数组 |
| `src/app/(access)/access/[instanceId]/page.tsx` | lines 395/483/506 单端口改多端口 |

---

## 第 13 章 执行顺序

按依赖拓扑排序。同一阶段内可并行，跨阶段必须先完成前序。

### 阶段 A：基础设施（无依赖）

| # | 任务 | 依赖 |
|---|---|---|
| **A1** | DB 迁移：`templates` / `workspace_payloads` 新表 + §8.1 全部字段（手写 SQL + 登记 `_journal.json`） | — |
| **A2** | `src/lib/templates/types.ts`（类型定义） | — |
| **A3** | `npm i jszip`（§3.4 解包依赖） | — |
| **A4** | `scripts/build-cli-bundle.sh` + 产物放 `public/` | — |
| **A5** | `scripts/publish-agent.sh`（agent 二进制构建通道） | — |

### 阶段 B：后端数据层（依赖 A）

| # | 任务 | 依赖 |
|---|---|---|
| **B1** | `templates/validate.ts`（动态 zod） | A2 |
| **B2** | `templates/zip.ts`（解包 + zip slip 防护） | A2 |
| **B3** | `templates/render.ts`（`{{key}}` 渲染，从 agent 移来） | A2 |
| **B4** | `/api/templates`（列表 + 自建） | A1, B1 |
| **B5** | `/api/templates/[id]`（详情） | A1 |
| **B6** | `/api/templates/upload`（zip → 解包 → 存 DB） | A1, B2 |
| **B7** | `/api/templates/[id]/instantiate`（校验 + 渲染 + 落库） | A1, B1, B3 |
| **B8** | `/api/instances/[id]/payload`（agent 拉载荷） | A1 |

### 阶段 C：agent（依赖 B8）

| # | 任务 | 依赖 |
|---|---|---|
| **C1** | `fetcher/fetcher.go`：拉载荷文件数组 + 落盘 | B8 |
| **C2** | `executor/runner.go` → `RunEntry()` | C1 |
| **C3** | `config/config.go` 新字段 | C1 |
| **C4** | `main.go` 补 `ReportReady()` + 调用链 | C2 |
| **C5** | `devcontainer/runner.go`（CLI 调用） | C2, A4 || **C6** | `compose/runner.go` | C2 |
| **C7** | `activity/detector.go` | C4 |

**验证点 C**：`python-script` 模板能跑通（拉载荷 → 落盘 → 执行 → 上报就绪）。

### 阶段 D：探活与回收（依赖 C4、C7）

| # | 任务 | 依赖 |
|---|---|---|
| **D1** | `agent/heartbeat/manager.go` + `reporter` payload 扩展 | C4, C7 |
| **D2** | `/api/instances/[id]/agent-ready`：加 `getInstance()` 写 `publicIp` | C4, B7 |
| **D3** | `/api/instances/[id]/agent-heartbeat`：写 `lastHeartbeatAt`（修 H1/H2） | D1 |
| **D4** | `lifecycle.ts`：加 `reapStale()` / `releaseIdle()` | D2, D3 |
| **D5** | `/api/maintenance` 新建：前端触发三合一 | D4 |
| **D6** | DB 迁移 `0013_add_instance_heartbeat.sql` + 前端 `load()` 打点 | D5 |

### 阶段 E：访问链路（依赖 D2）

| # | 任务 | 依赖 |
|---|---|---|
| **E1** | `provisioning.ts`：删 8080 硬编码；按访问者 IP 开 `1/65535` | — |
| **E2** | `/access/[code]`：加 IP 白名单 + 多端口按钮 | E1, D2 |
| **E3** | `aliyun/ecs.ts`：`authorizeIngress` 用法 | E1 |

### 阶段 F：前端（依赖 B4/B5、E2）

| # | 任务 | 依赖 |
|---|---|---|
| **F1** | 模板列表页 | B4 |
| **F2** | 模板详情/表单页（`params` → 表单 + 载荷上传） | B5, B6 |
| **F3** | 创建完成页 / 访问页（`activity.ports` → 按钮） | E2 |
| **F4** | 实例详情页（`currentEntry` + 元数据端口） | D3 |
| **F5** | 模板编辑页 | B4, B6 |

### 阶段 G：模板与市场（依赖 C5/C6、F2）

| # | 任务 | 依赖 |
|---|---|---|
| **G1** | 内置模板 `python-script` / `blank` | C2, F2 |
| **G2** | 内置模板 `docker-image` | C5, F2 |
| **G3** | 内置模板 `database` / `code-server` | C5, F2 |
| **G4** | 内置模板 `compose-app` | C6, F2 |
| **G5** | 市场通道 `templates.json` | B4 |

### 关键路径

```
A1 → B7 → C1 → C2 → C4 → D2 → E2 → F3
```

最短可用闭环（能跑起一个 shell 模板并从浏览器访问）：
**A1 → A2 → B1/B3/B7 → B8 → C1 → C2 → C4 → D2 → E1 → E2 → F3**

### 阶段验收点

| 阶段 | 做完后应该能验证 |
|---|---|
| A | `tsc --noEmit` 通过；`drizzle/0013` 已登记 |
| B | `curl /api/templates` 返回内置模板列表；`instantiate` 能写库 |
| C | `python-script` 模板实例能跑通：拉载荷 → 落盘 → 执行 → `ReportReady` 到达后端 |
| D | 实例 RUNNING 后 `publicIp` 已落库；停掉 agent 3 分钟后状态变 FAILED |
| E | 浏览器打开 `/access/<code>` 能看到多端口按钮，点击可直连 |
| F | 前端能建模板、填表单、生成按钮 |
| G | 7 个内置模板全部可用 |

### 收尾清理（最后做）

| # | 任务 | 现状 |
|---|---|---|
| **Z1** | 删除 `src/app/api/instance-scripts/startup/route.ts` | 存在，需删 |
| **Z2** | 删除 `scripts/startup.sh` | 存在（228 行），需删 |
| **Z3** | `scripts/entrypoint.sh` 重写（拉 agent + Node + CLI bundle） | 存在（66 行），需改 |
| **Z4** | 移除 `startup.sh:200` 的 host 模式回退 | 随 Z2 一起消失 |

> 无需处理的项：`agent/render/`、`agent/ports/`、`workspaces/[id]/upload`
> 在当前代码中均不存在。

---

## 第 14 章 模板清单

| id | entry | 类型 | 载荷内含 | 前端按钮 |
|---|---|---|---|---|
| `blank` | `run.sh` | COMMAND | 空脚本 | 无 |
| `python-script` | `run.sh` | COMMAND | `run.sh`（装 python + clone + 启动） | `:8000 API` |
| `docker-image` | `devcontainer.json` | DEVCONTAINER | `devcontainer.json` | `:8080 Web` |
| `static-site` | `run.sh` | COMMAND | `run.sh`（装 node + clone + build + http.server） | `:3000 站点` |
| `code-server` | `devcontainer.json` | DEVCONTAINER | `devcontainer.json` + `postCreateCommand` 装 code-server | `:8080 IDE` |
| `database` | `devcontainer.json` | DEVCONTAINER | `devcontainer.json`（postgres）+ `backup.sh` | `:5432 数据库` |
| `compose-app` | `docker-compose.yml` | COMPOSE | `docker-compose.yml`（app + db） | `:3000 Web` |

### 14.1 `python-script`

元数据：

```json
{
  "id": "python-script",
  "name": "Python 脚本服务",
  "description": "上传自己的脚本，实例启动后自动运行",
  "category": "web",
  "params": [
    { "key": "repo", "label": "Git 仓库", "type": "string", "required": true },
    { "key": "port", "label": "端口", "type": "number", "default": 8000, "min": 1024, "max": 65535 }
  ],
  "entry": "run.sh",
  "activity": { "ports": [{ "port": 8000, "label": "API" }], "idleMinutes": 30 },
  "timeout": 1200
}
```

载荷 `run.sh`：

```bash
#!/bin/bash
set -e

apt-get update -qq
apt-get install -y python3 python3-pip git

cd /workspace
[ -d app ] || git clone --depth 1 "{{repo}}" app
cd app
pip3 install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

nohup python3 -m uvicorn main:app --host 0.0.0.0 --port "{{port}}" > /workspace/app.log 2>&1 &
sleep 2
```

### 14.2 `docker-image`

元数据：

```json
{
  "id": "docker-image",
  "name": "Docker 镜像启动",
  "description": "填个镜像地址，启动后自动拉起容器",
  "category": "container",
  "params": [
    { "key": "image", "label": "镜像地址", "type": "string", "default": "nginx:alpine", "required": true },
    { "key": "port", "label": "对外端口", "type": "number", "default": 8080, "min": 1024, "max": 65535 }
  ],
  "entry": "devcontainer.json",
  "activity": { "ports": [{ "port": 8080, "label": "Web" }], "idleMinutes": 30 }
}
```

载荷 `devcontainer.json`：

```json
{
  "name": "Docker App",
  "image": "{{image}}",
  "forwardPorts": [{{port}}],
  "containerEnv": { "TZ": "Asia/Shanghai" },
  "runArgs": ["--restart", "unless-stopped"]
}
```

`forwardPorts` 里的 `{{port}}` 不加引号（JSON number）。

### 14.3 `database`

载荷 `devcontainer.json`：

```json
{
  "name": "PostgreSQL",
  "image": "postgres:16-alpine",
  "forwardPorts": [5432],
  "containerEnv": {
    "POSTGRES_PASSWORD": "{{password}}",
    "POSTGRES_DB": "{{database}}"
  },
  "runArgs": [
    "-v", "/workspace/pgdata:/var/lib/postgresql/data"
  ],
  "postCreateCommand": "bash /opt/ws/scripts/backup.sh"
}
```

载荷 `scripts/backup.sh`：

```bash
#!/bin/bash
# 备份循环：每 10 分钟 dump 到 /workspace
mkdir -p /workspace/dumps
while true; do
  docker exec $(docker ps -qf name=ws-app) \
    pg_dumpall -U postgres > "/workspace/dumps/all-$(date +%Y%m%d-%H%M).sql" 2>/dev/null
  sleep 600
done
```

---

## 第 15 章 职责边界

**平台负责**：

- 渲染表单（由 `params` 生成）
- 上传 zip → 后端解包校验 → 存 DB
- 渲染 `{{key}}` 到载荷文件（实例化时，后端）
- 下发载荷文件数组给 agent
- 执行 entry：`bash` / `devcontainer up` / `docker compose up`
- 从后端拉取基础工具链：agent 二进制、Node、`@devcontainers/cli`（放 `public/`）
- 安全组 `1/65535` 全端口 + 访问者 IP 白名单
- 时序：前端懒处理 + agent 心跳（第 10 章）
- 超时 / 失败 → 释放整台实例 + 上报完整终端日志

**用户自查表**：

| 遇到 | 改哪里 | 怎么改 |
|---|---|---|
| `image` 拉不到 | `devcontainer.json` 的 `image` | 换成国内可达地址（如 ACR 镜像） |
| `features` 拉不到 | `devcontainer.json` 的 `features` | 删掉，在 `postCreateCommand` 里 `apt-get install` |
| `build` 基础镜像拉不到 | `Dockerfile` 的 `FROM` | 换基础镜像 |
| 按钮没出现 | 模板元数据的 `activity.ports` | 补上端口声明 |

平台保证：把失败原因（CLI 原始 stderr）完整展示给用户。

---

## 第 16 章 开工前准备

### 16.1 环境依赖

| 项 | 现状 | 动作 |
|---|---|---|
| `jszip` | **未安装** | `npm i jszip`（§3.4 解包用） |
| `.env` | **不存在**（只有 `.env.example`） | `cp .env.example .env`，填 `DATABASE_URL` / `ENCRYPTION_KEY` / `NEXTAUTH_SECRET` |
| Go 工具链 | 本机需可用 | `go build` 在 `agent/` 内执行（`npm run build:agent`） |
| `stripe`/其他 | — | 无需 |

### 16.2 基线验证（开工前先跑一遍，确认起点是绿的）

```bash
node ./node_modules/typescript/bin/tsc --noEmit    # 期望：无输出
node ./node_modules/next/dist/bin/next build        # 期望：Compiled successfully + lint 通过
```

构建在 `Collecting page data` 阶段可能报 `DATABASE_URL is not set` —— 这是**没配 .env 的正常现象**，
只要前面出现 `✓ Compiled successfully` 且 lint 无 error，代码层就是干净的。

### 16.3 事实核对表（2026-09-11 核验）

文档中出现的引用，逐条对照代码的结论：

**存在且准确**（可直接照做）：

| 引用 | 实际 |
|---|---|
| `scripts/entrypoint.sh:32` 拉 agent | ✅ `${CALLBACK_URL}/agent-linux-${AGENT_ARCH}` |
| `scripts/entrypoint.sh:52` `heartbeat_interval: 30` | ✅ |
| `scripts/startup.sh:200` host 回退 | ✅ `falling back to host mode` |
| `src/lib/ecs/provisioning.ts:89-90` | ✅ `authorizeIngress(..., "22/22")` + `"8080/8080"` |
| `src/lib/instances/access.ts` | ✅ `ALL_PORTS` / `toPortRanges` / `registerVisitorIp` / `extractVisitorIp` 全实存 |
| `src/app/api/instances/[id]/agent-ready/route.ts` | ✅ 现状收 `{token, publicIp, port}`，需改 |
| `src/app/api/instance-scripts/startup/route.ts` | ✅ 存在，可删 |
| `src/components/instances/instance-detail.tsx:44` `BOOT_PHASES` | ✅ |
| `src/components/instances/instance-detail.tsx:164` `instance.port ?? 8080` | ✅ |
| `src/app/(access)/access/[instanceId]/page.tsx:396/483/508` | ✅ 三处单端口 |
| `agent/reporter/reporter.go:170` `ReportReady()` 零调用 | ✅ 全仓仅定义处 |
| `agent/heartbeat/manager.go:190` `IsIdle()` 零调用 | ✅ |
| `agent/executor/runner.go:109` `Execute()` | ✅（文档旧称 `RunScript()`，实际是 `Execute()`） |
| `agent/config/config.go:24` `IdleMinutes` | ✅ 定义但未使用 |
| `src/lib/constants.ts` `ALL_PORTS = 0` | ✅ |

**不存在**（不要去找、不要删）：

| 文档旧写法 | 结论 |
|---|---|
| `agent/render/` | ❌ 目录不存在 |
| `agent/ports/` | ❌ 目录不存在 |
| `src/app/api/workspaces/[id]/upload` | ❌ 路由不存在 |
| `workspaces.zip_oss_key` 字段 | ❌ 不存在 |
| `instances.exposed_ports` 字段 | ❌ 不存在 |
| `validatePorts()` / `BLOCKED_PORTS` | ❌ 不存在 |
| `RunScript()` 方法 | ❌ 实际叫 `Execute()` |

**需新建**（文档已列，确认前置依赖）：

| 新建 | 前置 |
|---|---|
| `src/lib/templates/types.ts` | 无 |
| `src/lib/templates/zip.ts` | **`npm i jszip`** |
| `src/app/api/maintenance/route.ts` | 已建（本次已实现） |
| `agent/fetcher/` | 后端 `/api/instances/[id]/payload` 先就绪 |
| `agent/devcontainer/` | `public/devcontainer-cli.tar.gz` 先产出 |
| `agent/compose/` | 无 |
| `agent/activity/` | 无 |

### 16.4 已知坑

| 坑 | 说明 |
|---|---|
| `drizzle-kit generate` 要 TTY | 非交互环境跑不了，迁移**手写** SQL + 手动登记 `drizzle/meta/_journal.json` 的 `idx` |
| 本机 Git Bash 残缺 | `dirname`/`ls`/`grep`/`awk`/`wc` 不可用。用 Glob/Grep 工具或 PowerShell；跑本地二进制用 `node ./node_modules/...` |
| `AskUserQuestion` 慎用 | 执行期遇到歧义优先按本文档决策表办，不要反复回问 |
| 文档间冲突 | `docs/archive/` 下的旧稿前提已变（如 agent 走 OSS），**忽略它们** |
