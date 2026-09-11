# MeterSpace 模板协议规范

> 版本：v3.0（统一元数据 + zip 载荷）
> 日期：2026-09-11
> 状态：设计阶段（承接 `DETAILED-DESIGN.md` v4.0）
>
> **v3 相对 v2 的变化**：模型彻底分为两半——**元数据只管"填什么空"，zip 管"带什么货"**。
>
> | 版本 | 模型 |
> |---|---|
> | v1 | 完整模板引擎（Mustache + 6 文件树 + 三层 SDK + 11 种参数 + 校验器） |
> | v2 | 4 阶段命令 + 5 种参数 |
> | **v3** | **一份元数据 JSON（挖空）+ 一个 zip 包（载荷）** |

---

## 一、模型总览

```
模板 = 元数据 JSON  +  zip 包
       ↑             ↑
    平台定义的      用户/模板作者提供的
    "挖空表单"      "文件与入口"
```

| | 谁提供 | 存哪 | 作用 |
|---|---|---|---|
| **元数据 JSON** | 用户在 MeterSpace 里写 | 数据库 | 定义表单字段、展示信息、探活声明 |
| **zip 包** | 用户上传 | OSS | 装用户脚本 / `devcontainer.json` / Dockerfile / 任何文件 |

**一句话**：**MeterSpace 里只有元数据和填空，剩下全在 zip 里。**

### 1.1 为什么这样分是对的

| 关注点 | 归属 | 理由 |
|---|---|---|
| 用户看到什么表单 | 元数据 | 平台要渲染 UI，必须结构化 |
| 实例空闲多久销毁 | 元数据 | 平台资源管理职能，必须结构化 |
| 脚本写什么 | zip | 平台不关心，别管 |
| 用什么镜像 | zip | 平台不关心，别管 |
| 怎么装 python | zip | 平台不关心，别管 |

**这条界线画得很准**：元数据里**只放平台必须理解的东西**（表单渲染 + 资源回收），凡是平台只需要"原样执行"的，全丢 zip。

---

## 二、元数据 JSON

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
    {
      "key": "repo",
      "label": "Git 仓库",
      "type": "string",
      "required": true,
      "placeholder": "https://github.com/me/app.git"
    },
    {
      "key": "port",
      "label": "服务端口",
      "type": "number",
      "default": 8000,
      "min": 1024,
      "max": 65535
    },
    {
      "key": "installDeps",
      "label": "安装依赖",
      "type": "boolean",
      "default": true
    }
  ],

  "entry": "run.sh",

  "activity": {
    "ports": [8000],
    "idleMinutes": 30
  }
}
```

### 2.2 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 唯一，`^[a-z0-9][a-z0-9-]{1,63}$` |
| `name` | ✅ | 展示名 |
| `description` | ❌ | 一句话 |
| `category` | ❌ | `container` / `web` / `database` / `dev-env` / `ai` / `toolchain` / `blank` |
| `icon` | ❌ | 图标名 |
| `tags` | ❌ | 检索用 |
| `params` | ❌ | 挖空的字段定义（可空数组） |
| `entry` | ✅ | **zip 内的入口文件路径**，如 `run.sh` 或 `devcontainer.json` |
| `activity` | ❌ | 探活声明 |

### 2.3 `entry`：唯一的入口声明

**`entry` 就是一个 zip 内的相对路径。** 平台拿它做什么，取决于**文件本身**：

| `entry` 指向 | 平台行为 |
|---|---|
| `run.sh` / `main.sh` / `start.sh` / `*.sh` | `bash <file>` |
| `devcontainer.json` | 按 devcontainer 规则起容器 |
| `docker-compose.yml` | 按 compose 起服务（可选，见 §4.3） |
| 其他 | ⚠️ 报错：无法识别的入口类型 |

**为什么按文件名判断而不在元数据里写类型**：因为类型**本来就是文件名决定的**。`devcontainer.json` 这个文件名本身就携带全部语义（VSCode 也是这么识别的）。在元数据里再写一遍 `type: "devcontainer"` 是冗余，还会产生"声明是 A 但文件是 B"的矛盾状态。

**约定优于配置。**

### 2.4 `params`：5 种类型

```json
{ "key": "image",  "label": "镜像地址", "type": "string",  "default": "nginx:alpine", "required": true }
{ "key": "cmd",    "label": "启动命令", "type": "text",    "default": "" }
{ "key": "port",   "label": "端口",     "type": "number",  "default": 8080, "min": 1, "max": 65535 }
{ "key": "debug",  "label": "调试模式", "type": "boolean", "default": false }
{ "key": "mode",   "label": "模式",     "type": "select",  "default": "dev",
  "options": [{ "value": "dev", "label": "开发" }, { "value": "prod", "label": "生产" }] }
```

| type | 控件 | 值 | 额外字段 |
|---|---|---|---|
| `string` | 单行输入 | string | `placeholder` |
| `text` | 多行输入 | string | `placeholder` |
| `number` | 数字输入 | number | `min` / `max` |
| `boolean` | 开关 | boolean | — |
| `select` | 下拉 | string | `options`（必填） |

**没有 `secret` / `keyvalue` / `path` / `file-ref`，没有 `when` 条件，没有分组。** 需要密钥就用 `string`（用户在 zip 里自己决定怎么用）；需要多组键值就用 `text` 让用户按行填，脚本里自己解析。

### 2.5 `activity`：探活声明（平台必须理解，所以必须在元数据里）

```json
"activity": {
  "ports": [8000],
  "idleMinutes": 30,
  "sampleIntervalSec": 30
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `ports` | 元数据 `activity.ports` → 缺省为空 | 探测哪些端口有活跃连接 |
| `idleMinutes` | 30 | 空闲多久判定为闲 |
| `sampleIntervalSec` | 30 | 采样间隔 |

**判定逻辑（平台固定，不可配）**：

```
每 sampleIntervalSec：
  读 /proc/net/tcp
    ├─ 目标端口有 ESTABLISHED 连接
    └─ 且 local / remote 都不是 127.0.0.1     ← 排除健康检查误判
  有 → lastActiveAt = now
  lastActiveAt 距今 > idleMinutes
  → 前端 /api/maintenance 触发 → 停止实例
```

这就是你要的"用元数据声明式就可以了"。**算法不动，对象可配。**

---

## 三、zip 载荷

### 3.1 结构

zip 是**扁平的工作空间根目录**，解压到 `/opt/ws/`：

```
workspace.zip
├── run.sh                  ← entry 指向它
├── scripts/
│   ├── setup.py
│   └── build.ts
├── files/
│   └── nginx.conf
└── （任意结构、任意文件）
```

或者 devcontainer 型：

```
workspace.zip
├── devcontainer.json       ← entry 指向它
├── Dockerfile
└── .dockerignore
```

### 3.2 限制

| 项 | 限制 | 理由 |
|---|---|---|
| 包大小 | 50 MB | 这是"脚本+配置"，不是代码仓库；大文件应走 `git clone` |
| 解压后大小 | 200 MB | 防 zip 炸弹 |
| 文件数 | 2000 | 防呆 |
| 路径 | 禁绝对路径、禁 `..` | 防目录穿越（zip slip） |
| 解压方式 | 逐条校验路径后再落盘 | **必须**，见 §3.3 |

**为什么 zip 上限比 v4 的 2MB 大得多**：v4 走 DB + UserData 注入（16KB）。v3 走 **OSS**，没有大小约束，50MB 是防止滥用而非技术限制。

### 3.3 安全：zip slip 防护（必做）

```typescript
// 解压时必须逐条校验
for (const entry of zip.getEntries()) {
  const target = path.resolve("/opt/ws", entry.entryName);
  if (!target.startsWith("/opt/ws/")) {
    throw new Error(`zip slip: ${entry.entryName}`);
  }
  // 拒绝符号链接
  if (entry.attr & 0xa000) {
    throw new Error(`symlink not allowed: ${entry.entryName}`);
  }
}
```

**这是经典的 zip slip 漏洞**：`../../etc/passwd` 这样的路径会写到预期目录之外。必须在解压前逐条校验。

### 3.4 上传方式

| 方式 | 说明 |
|---|---|
| 前端上传 | 用户在模板编辑页拖一个 zip 进来 |
| 后端转 OSS | `POST /api/templates/[id]/upload` → 存到 `my-dev-workspace-${region}` 桶 |

**存储路径**：

```
oss://my-dev-workspace-{region}/templates/{templateId}/{version}/workspace.zip
```

**agent 拉取**：走 OSS **内网端点** `oss-{region}-internal.aliyuncs.com`，零流量费（这是 `ACR-PLAN.md` 里唯一被继承下来的决策）。

---

## 四、参数怎么进 zip

### 4.1 渲染时机：agent 侧解压后

```
① 用户填参数 → POST /api/templates/{id}/instantiate
② 后端校验参数 → 写 DB（模板实例：params + entry + activity）
③ 启动实例
④ agent 从 OSS 拉 workspace.zip → 解压到 /opt/ws/
⑤ agent 对 entry 指向的文件做 {{key}} 渲染        ← 关键
⑥ agent 按 entry 类型执行
```

**为什么在 agent 侧渲染而不是后端**：因为渲染要读 zip 内容，而 zip 在 OSS 上。后端解压再传一遍是浪费（50MB 走两次网络）。

### 4.2 渲染范围：只渲染 entry 文件

**只对 `entry` 指向的那一个文件做 `{{key}}` 替换**，zip 里其他文件原样保留。

```
entry = "run.sh"
  → 只渲染 /opt/ws/run.sh
  → /opt/ws/scripts/setup.py 原样

entry = "devcontainer.json"
  → 只渲染 /opt/ws/devcontainer.json
  → /opt/ws/Dockerfile 原样
```

**为什么只渲染 entry**：如果全量渲染，用户脚本里出现的 `{{...}}`（比如 Go 模板、Jinja2 模板、Helm chart）会被误替换。**只渲染入口文件，副作用面最小。**

### 4.3 替换规则

```javascript
// 朴素文本替换：{{key}} → 参数值
"pip install {{pkg}}"  +  { pkg: "requests" }  →  "pip install requests"
```

| 规则 | 说明 |
|---|---|
| 语法 | `{{key}}`，key 取自 `params` |
| 未定义的 key | **保留原样**（不报错），方便用户写 shell 的 `{{` |
| 转义 | ❌ 不做（用户是给自己写命令） |
| 例外 | **`devcontainer.json` 做 JSON 字符串转义**（见下） |

**JSON 转义的例外**（必须有）：

```javascript
// devcontainer.json 是结构化的，破了就整个起不来
const escaped = JSON.stringify(value).slice(1, -1);
```

比如用户填的镜像名含 `"`，不转义就破 JSON。**COMMAND 类型不转义（用户自己加引号），DEVCONTAINER 类型转义（平台负责）。** 这个差异有理由：JSON 是结构性的，shell 是约定性的。

### 4.4 zip 里也能用环境变量

除了 `{{key}}` 参数替换，脚本运行时还能读平台注入的环境变量：

```bash
$WS_ROOT              # /opt/ws
$WS_WORKSPACE         # /workspace（持久化目录）
$WS_EXPOSED_PORTS_FILE  # 端口声明文件
$WS_INSTANCE_ID / $WS_WORKSPACE_ID / $WS_REGION
```

---

## 五、两种 entry 的执行

### 5.1 COMMAND（`entry` 指向 `.sh`）

```
agent:
  1. 定位 /opt/ws/{entry}
  2. 渲染 {{key}}
  3. 若 entry 不以 .sh 结尾 → 报错
  4. bash <entry>，工作目录 /opt/ws
  5. 进程组隔离（Setpgid），超时 kill(-pgid)
  6. 退出码 0 → 成功；非 0 → 失败
  7. 读 $WS_EXPOSED_PORTS_FILE → 上报端口与就绪
```

**超时**：

| 项 | 默认 | 上限 |
|---|---|---|
| 脚本执行 | 1800s (30min) | 3600s |

超时行为：`SIGTERM` → 10s → `SIGKILL`，**杀整个进程组**。否则 `docker run` / `npm start &` 的子进程会残留。

**你完全不管脚本里写什么**——`bash run.sh` 跑完看退出码。写 shell、`python3 -c '...'`、`curl xxx | bash` 都行。

### 5.2 DEVCONTAINER（`entry` 指向 `devcontainer.json`）

**执行策略待定（§8 D1）**，两个候选：

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A. 实例上跑 devcontainer CLI** | 装 `devcontainer` CLI，`devcontainer up --workspace-folder /opt/ws` | 完整支持 features / 挂载 / 用户 | 国内网络装 node+CLI 麻烦；features 走 `ghcr.io` **本来也拉不动** |
| **B. 解析后生成 `docker run`** | agent 读 devcontainer.json，只取 `image` / `forwardPorts` / `postCreateCommand` / `containerEnv`，拼 `docker run` | 简单、快、无额外依赖 | 不支持 features（但**这正好是国内不可用的部分**） |

**我的建议：B。**

理由：features 依赖 `ghcr.io`，在你这个"国内网络太差"的语境下本来就不可用（这是项目最初的痛点）。为了一个用不了的能力去背 CLI 的包袱是负收益。

**B 的支持字段**：

| devcontainer 字段 | 映射到 |
|---|---|
| `image` | `docker run <image>` |
| `build.dockerfile` | `docker build -t ws-app <ctx>` 后 run |
| `forwardPorts` | `-p <host>:<container>` + 安全组 + 对外入口 |
| `containerEnv` | `-e KEY=VALUE` |
| `postCreateCommand` | `docker exec` 里跑一次 |
| `runArgs` | 透传给 `docker run` |

**明确不支持**（文档里要写清）：`features` / `customizations` / `mounts` / `remoteUser` / `dockerComposeFile`。

**注**：`dockerComposeFile` 建议**单独作为第三种 entry 支持**（`docker-compose.yml`），因为多服务场景（app + db）用 compose 最自然，而且 compose 是自包含的格式，agent 只需 `docker compose up -d`。见 §8 D2。

### 5.3 端口来源（两种类型不同）

| entry 类型 | 端口来源 |
|---|---|
| `*.sh` | **`$WS_EXPOSED_PORTS_FILE`**（脚本自己写） |
| `devcontainer.json` | **`forwardPorts`**（声明式，不需要脚本写文件） |

**这解决了 v2 的一个坑**：容器里看不到宿主机注入的 `$WS_EXPOSED_PORTS_FILE`。devcontainer 类型用 `forwardPorts` 就绕过了这个问题——**端口在元数据/配置里声明，不靠容器内写文件**。

### 5.4 端口声明格式（COMMAND 类型）

```bash
cat > "$WS_EXPOSED_PORTS_FILE" <<'EOF'
[{"port": 8000, "label": "API", "protocol": "http"}]
EOF
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `port` | ✅ | 1-65535 |
| `label` | ❌ | 展示名 |
| `protocol` | ❌ | `http` / `tcp`，默认 `http` |
| `private` | ❌ | `true` = 内网，不对外开 |

**回退顺序**：脚本写了文件 → 用文件；文件不存在 → 元数据 `activity.ports`；都空 → 默认 8080。

### 5.5 安全组：必须动态开（重要缺陷）

**现状**（`src/lib/ecs/provisioning.ts`）：

```typescript
// ensureInstanceSecurityGroup() 建的是全关 SG，靠访问者 IP 动态开
// ensureRegionResources() 建的是固定开 22 + 8080
```

**两种 SG 都有问题**：

| SG | 问题 |
|---|---|
| 区域级（`ensureRegionResources`） | 固定只开 22/8080 → **多端口模板（8000、3000、5432）全部不通** |
| 实例级（`ensureInstanceSecurityGroup`） | 全关，靠访问者 IP 开 → **agent 声明的端口必须先"登记"才能开规则** |

**修正方案**：

```
agent 上报就绪 + 端口列表
  ↓
后端 /agent-ready 收到 ports
  ↓
① 写 instances.exposed_ports
② 为该实例的 SG 开放这些端口（对 0.0.0.0/0 或访问者 IP）
③ 同步更新访问码的 allowed_ports
④ 访问页展示多端口入口
```

**这是 P0**：不做这个，`python-script`（8000）、`node-backend`（3000）、`database`（5432）**全都访问不了**。

**允许开放的端口白名单**：建议 `1024-65535` 且排除已知危险端口；`< 1024` 需要额外确认（避免用户开 22 覆盖 SSH）。

---

## 六、与项目对接

### 6.1 数据模型

```sql
-- 模板实例（用户创建的"工作区"）新增字段
ALTER TABLE workspaces ADD COLUMN template_id TEXT;
ALTER TABLE workspaces ADD COLUMN template_version TEXT;
ALTER TABLE workspaces ADD COLUMN template_params JSONB DEFAULT '{}';
ALTER TABLE workspaces ADD COLUMN entry TEXT;              -- zip 内入口路径
ALTER TABLE workspaces ADD COLUMN zip_oss_key TEXT;        -- OSS 对象键
ALTER TABLE workspaces ADD COLUMN activity_config JSONB;   -- 探活声明

-- 端口（来自 forwardPorts 或运行时脚本声明）
ALTER TABLE instances ADD COLUMN exposed_ports JSONB DEFAULT '[]';

-- 旧字段处置
ALTER TABLE workspaces ALTER COLUMN image_uri DROP NOT NULL;
```

**`image_uri` 保留但不使用**（兼容旧数据），新模板走 zip。

**不再需要的**：`workspace_files` 表（v4 设计）**取消**——文件全在 zip 里，不需要 DB 存每个文件。

> 这大幅简化了 v4 的设计：不用 `workspace_files` 表、不用文件 CRUD API、不用目录树编辑器（改为 zip 上传）。这正是"剩下的上传一个 zip 包"带来的收益。

### 6.2 API

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/templates` | GET | 列表（从市场 + 内置合并） |
| `/api/templates/[id]` | GET | 详情（含 `params` 定义） |
| `/api/templates/[id]/instantiate` | POST | 校验参数 + 落库，返回 `workspaceId` |
| `/api/workspaces/[id]/upload` | POST | **上传 zip** → OSS |
| `/api/instances/[id]/workspace-zip` | GET | **agent 拉 zip**（token 鉴权，返回 OSS 预签名 URL） |
| `/api/instances/[id]/agent-ready` | POST | 接收 `ports`，写 `exposed_ports`，**开安全组** |

**agent 拉 zip 用预签名 URL 而非代理下载**：agent 直连 OSS 内网，比走后端中转快得多，也不用后端承担 50MB 流量。

### 6.3 模板来源

```
① 市场（主）：GET {MARKETPLACE_URL}/api/templates.json
② 内置（兜底）：src/lib/templates/builtin/*.json
③ 用户自建：用户在 MeterSpace 里直接写元数据 + 传 zip
```

**第三种是新增的、也是你这次的重点**：用户不需要去市场，在 MeterSpace 里就能造模板。

**合并策略**：同名 id 时，市场覆盖内置，用户自建优先于两者。

### 6.4 创建流程

```
方式 A：从模板创建
  选模板 → 填 params → 上传 zip（或用模板自带的）→ 创建实例

方式 B：从零创建
  写元数据（id/name/params/entry/activity）→ 上传 zip → 创建实例

两者走同一条路：都是"元数据 + zip"。
```

**"从零创建"不特殊**——这就是 v3 简化后的最大收益：没有"空白模板"这个概念了，从零创建就是"填元数据 + 传 zip"。

---

## 七、模板清单

| id | entry | 类型 | zip 里有什么 |
|---|---|---|---|
| `blank` | `run.sh` | COMMAND | 空脚本，用户自己写 |
| `python-script` | `run.sh` | COMMAND | `run.sh`（装 python + 克隆 + 启动） |
| `static-site` | `run.sh` | COMMAND | `run.sh`（装 node + clone + build + http.server） |
| `docker-image` | `devcontainer.json` | DEVCONTAINER | `devcontainer.json`（`image` + `forwardPorts`） |
| `code-server` | `devcontainer.json` | DEVCONTAINER | `devcontainer.json`（`image` + `postCreateCommand` 装 code-server） |
| `database` | `devcontainer.json` | DEVCONTAINER | `devcontainer.json`（`image: postgres:16`）+ backup.sh |
| `compose-app` | `docker-compose.yml` | COMPOSE | `docker-compose.yml`（app + db 多服务） |

### 示例：`python-script`

**元数据**：

```json
{
  "id": "python-script",
  "name": "Python 脚本服务",
  "category": "web",
  "params": [
    { "key": "repo", "label": "Git 仓库", "type": "string", "required": true },
    { "key": "port", "label": "端口", "type": "number", "default": 8000 }
  ],
  "entry": "run.sh",
  "activity": { "ports": [8000], "idleMinutes": 30 }
}
```

**zip 内的 `run.sh`**：

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

echo '[{"port":{{port}},"label":"API"}]' > "$WS_EXPOSED_PORTS_FILE"
```

> 注意 `{{repo}}` 加了引号——**平台不做转义，用户自己负责**。这是 v3 明确的取舍。

### 示例：`docker-image`

**元数据**：

```json
{
  "id": "docker-image",
  "name": "Docker 镜像启动",
  "category": "container",
  "params": [
    { "key": "image", "label": "镜像地址", "type": "string", "default": "nginx:alpine" },
    { "key": "port", "label": "对外端口", "type": "number", "default": 8080 }
  ],
  "entry": "devcontainer.json",
  "activity": { "ports": [8080], "idleMinutes": 30 }
}
```

**zip 内的 `devcontainer.json`**：

```json
{
  "name": "Docker App",
  "image": "{{image}}",
  "forwardPorts": [{{port}}],
  "containerEnv": { "TZ": "Asia/Shanghai" }
}
```

> `forwardPorts` 用 `{{port}}` 直接替换成数字（**不加引号**，因为它是 JSON number）。这就是 §4.3 说的 JSON 转义例外——平台负责保证不破 JSON。

---

## 八、实施顺序

| 阶段 | 内容 | 优先级 |
|---|---|---|
| **P1** | 修 `ReportReady` P0（现在零调用）+ 心跳分离（`lastActiveAt` 无条件刷新缺陷） | **P0** |
| **P2** | `templates` 元数据类型 + 参数校验 + 落库 | **P0** |
| **P3** | zip 上传 → OSS + 预签名 URL | **P0** |
| **P4** | agent 拉 zip + 解压（zip slip 防护）+ `{{key}}` 渲染 | **P0** |
| **P5** | COMMAND 执行（`bash entry` + 进程组超时） | **P0** |
| **P6** | 端口上报 + **安全组动态开** + 多端口访问页 | **P0** |
| **P7** | 活跃探测 + 闲时销毁闭环 | **P1** |
| **P8** | DEVCONTAINER 执行（解析 → `docker run`） | **P1** |
| **P9** | 模板创建 UI（元数据表单 + zip 上传 + 参数填写） | **P1** |
| **P10** | 内置 7 个模板 | **P2** |
| **P11** | COMPOSE 执行 | **P3** |

**关键路径**：P2 → P3 → P4 → P5 → P6（缺任一环，模板都跑不起来）。

---

## 九、待确认

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| **D1** | DEVCONTAINER 怎么执行 | A. 装 CLI / B. 解析生成 `docker run` | **B**（features 走 `ghcr.io` 国内拉不动，支持它是负收益） |
| **D2** | 要不要支持 `docker-compose.yml` 作为第三种 entry | 支持 / 不支持 | **支持**（多服务场景最自然，且 compose 自包含） |
| **D3** | zip 大小上限 | 50MB / 200MB / 1GB | **50MB**（这是脚本+配置，大文件走 git clone） |
| **D4** | `entry` 的自动发现 | 必须显式指定 / 自动找 `run.sh` | **必须显式指定**（避免歧义） |
| **D5** | 平台要不要预装 python3 | 预装 / 不预装 | **预装**（`http.server` 兜底托管很有用） |
| **D6** | 参数渲染是否加引号保护 | 加 / 不加 | **不加**（保持朴素，用户自己负责；仅 devcontainer.json 做 JSON 转义） |
| **D7** | 端口开放白名单 | 1024-65535 / 任意 | **1024-65535**，`< 1024` 需额外确认（避免覆盖 22） |

---

## 附录：协议速查

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "category": "container|web|database|dev-env|ai|toolchain|blank",
  "icon": "string",
  "tags": ["string"],

  "params": [
    { "key", "label", "type", "default", "required",
      "placeholder", "min", "max", "options" }
  ],

  "entry": "run.sh | devcontainer.json | docker-compose.yml",

  "activity": { "ports": [8080], "idleMinutes": 30, "sampleIntervalSec": 30 }
}
```

**脚本侧可见**：

```bash
$WS_ROOT                # /opt/ws
$WS_WORKSPACE           # /workspace（持久化）
$WS_EXPOSED_PORTS_FILE  # 端口声明文件（COMMAND 类型用）
$WS_INSTANCE_ID / $WS_WORKSPACE_ID / $WS_REGION
```

**平台职责边界**：

- ✅ 提供表单、拉 zip、解压、渲染 entry、执行 entry、收端口、开安全组、探活、闲时销毁
- ❌ 不管脚本里写什么、不管装什么、不管用什么镜像、不管跑什么语言
