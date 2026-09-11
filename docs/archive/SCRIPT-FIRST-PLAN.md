# MeterSpace 定位调整方案 — 从「镜像市场」转向「脚本编排」

> 版本：v2.0
> 日期：2026-09-11
> 状态：设计阶段
> 替代：`docs/ACR-PLAN.md`（该文档基于早期"镜像市场"假设，仅作历史参考）

---

## 一、定位调整（本次变更的核心）

### 1.1 从什么改到什么

| 维度 | 原设计 | 新定位 |
|---|---|---|
| 镜像 | 市场选模板，平台保证可用 | **不管**。用户自己填 URI，拉不到是用户的事 |
| 市场 | 镜像市场 + Feature 市场 | **冻结**。现有代码保留不动，不新增投入 |
| Playground | 有 | **冻结**。保留现状，不修改 |
| 核心交付 | 模板 → 秒级可用 | **脚本编排 → 可靠启动 → 多端口暴露** |
| ACR | 平台自动同步镜像 | **降级为可选加速**，用户自建镜像时可选用 |
| 编辑器 | code-server 自动装 | **改为用户自带**（通过脚本装，或镜像自带） |

### 1.2 新定位一句话

> **用户提交一段引导脚本，平台负责「起机器 → 跑脚本 → 暴露端口 → 给访问链接」。**

平台的价值不在"提供环境"，而在**可靠地调度云资源并把结果暴露出来**。

### 1.3 为什么这个定位更合理

1. **网络问题被绕过**：镜像/依赖的获取责任转移给用户脚本（用户可自选国内源、自建 ACR、用离线包），平台不再背"拉不到镜像"的锅。
2. **不做重资产**：不需要维护 registry 仓库、不需要同步镜像、不需要审核模板质量。
3. **覆盖面反而更广**：固定模板覆盖 80% 常用场景（一键可达），自定义脚本覆盖剩余 20%（不会被模板限制卡死）。
4. **利用已有资产**：`userScripts` 表、`instanceScripts` 表、agent 的脚本执行能力、access code 端口白名单机制都已存在。

---

## 二、现状盘点（哪些能直接用）

### 2.1 已有的可用能力

| 能力 | 位置 | 状态 |
|---|---|---|
| 脚本存储 | `userScripts` 表 + `/api/my-resources/scripts` | ✅ 已实现完整 CRUD |
| 工作区脚本绑定 | `instanceScripts` 表 | ✅ 有表，但**启动链路未消费** |
| 脚本执行 | agent `executor/runner.go` | ✅ 已实现，含日志流、超时、重试 |
| 日志上报 | agent → `/api/instances/[id]/agent-logs` | ✅ 已实现，前端 SSE 消费 |
| 端口白名单 | `instanceAccessCodes.allowedPorts` | ✅ 已实现，含 `ALL_PORTS=0` 哨兵 |
| 安全组按 IP 放行 | `src/lib/instances/access.ts` `registerVisitorIp` | ✅ 已实现，按端口范围授权 |
| 访问码 → 端口映射 | `/api/access/[instanceId]` | ✅ 已有 |

### 2.2 关键缺陷（本次必须修）

**缺陷 1：`port` 硬编码 8080，且 agent 从不调用 `agent-ready`**

- `agent-ready/route.ts` 用 `body.port`（默认 8080）写库
- 但 **Go agent 里没有任何地方调用 `ReportReady()`**（`reporter.go:170` 定义了函数，全项目零调用）
- `ready` 上报实际由 `startup.sh` 内的 `curl` 完成（旧路径），而新版 `startup.sh` 已删掉这段
- **结果**：实例可能永远停在 `BOOTING`，或 `publicIp` 为空

**缺陷 2：agent 心跳不携带 publicIp**

`HeartbeatPayload` 没有 IP 字段，若 `agent-ready` 未触发，后端永远不知道实例公网 IP。

**缺陷 3：`instanceScripts` 表被完全忽略**

`startup/route.ts:145` 写着 `const customScriptsLoop = "echo \"[scripts] No custom scripts\"";` —— 自定义脚本链路是死的。

**缺陷 4：脚本执行顺序无契约**

`startup.sh` 里 features、custom scripts、git 的执行顺序是硬编码的，用户无法控制。

---

## 三、目标架构

### 3.1 执行模型

```
用户侧配置
  ├─ 模板（固定，一键可用）
  │    └─ 只需选参数（如 Docker 镜像名）
  └─ 自定义脚本（完全自由，bash）
       └─ 按顺序执行，每段可见日志

启动链路
  createInstance()
    └─ ECS RunInstances(userData = entrypoint.sh)
         └─ entrypoint.sh
              ├─ 下载 agent（走 OSS 内网，见 §5）
              └─ 启动 agent
                   └─ agent 执行 startup.sh
                        ├─ [环境]  基础依赖（git/curl/jq）
                        ├─ [模板]  模板注入的脚本块（或空）
                        ├─ [自定义] 用户脚本（按 sortOrder）
                        ├─ [服务]  用户启服务
                        └─ [就绪]  写 /opt/agent/ports.json
                                     ↓
                              agent 读取 ports.json → 上报 READY(ports[])
                                     ↓
                              后端写库 + 安全组按端口放行
                                     ↓
                              前端展示 N 个入口链接
```

### 3.2 端口暴露契约（核心设计）

**约定：脚本通过写 `/opt/agent/ports.json` 声明暴露端口。**

```json
[
  { "port": 8080, "label": "VS Code", "protocol": "http" },
  { "port": 3000, "label": "Dev Server", "protocol": "http" },
  { "port": 5432, "label": "PostgreSQL", "protocol": "tcp" }
]
```

**为什么用文件而不是环境变量或 API：**

| 方案 | 问题 |
|---|---|
| 环境变量 | 脚本运行时才知道端口（如 dev server 动态选端口），环境变量是启动前确定的 |
| agent HTTP API | 用户脚本要记 agent 端口 + token，泄漏风险，且 9527 端口对外 |
| **文件** | ✅ 脚本随时可写；agent 执行完统一读取；无网络暴露；天然支持多端口 |

**agent 行为：**
1. 脚本执行前，删除残留的 `ports.json`（避免上次残留）
2. 脚本执行完成后，读取 `ports.json`
3. 若不存在或为空 → 回退默认 `[{port: 8080, label: "IDE"}]`（向后兼容）
4. 通过 `ReportReady(publicIP, ports)` 上报

**后端行为：**
1. `agent-ready` 接收 `ports: number[]`，写入 `instances.port`（主端口，取第一个）与新字段 `exposedPorts`（JSON）
2. 个人访问码的 `allowedPorts` 同步更新为这些端口
3. 前端展示 N 个入口

### 3.3 模板设计

**模板 = 预设脚本块 + 参数表单**，用户选模板后只需填参数。

| 模板 ID | 名称 | 参数 | 生成的脚本核心动作 |
|---|---|---|---|
| `docker-image` | 启动 Docker 容器 | `image`、`containerPort`、`hostPort`、`env[]`、`volumes[]` | `docker run -d -p hostPort:containerPort ...` + 写 ports.json |
| `static-site` | 静态站点 | `gitRepo`、`buildCmd`、`servePort` | clone → 构建 → `npx serve -l servePort` |
| `node-app` | Node.js 应用 | `gitRepo`、`branch`、`installCmd`、`startCmd`、`port` | clone → install → start |
| `python-app` | Python 应用 | `gitRepo`、`requirements`、`startCmd`、`port` | clone → pip install → start |
| `custom` | 自定义脚本 | 无（直接用用户脚本） | 按 `instanceScripts.sortOrder` 执行 |

**模板存储方式**：不要放 DB，放**代码内常量**（`src/lib/templates/`）。

理由：
- 模板是平台资产，不是用户数据，放代码里可版本控制、可类型检查
- 通过 `renderTemplate(id, params) => string` 纯函数生成脚本
- 用户可以"展开成脚本"后再改，实现从模板到自定义的平滑过渡

**模板 → 脚本的展开是一次性的**：展开后存进 `userScripts`，后续用户随便改。这样避免"模板改版导致存量工作区行为变化"的问题。

### 3.4 数据库变更

```sql
-- instances：支持多端口
ALTER TABLE instances ADD COLUMN exposed_ports JSONB DEFAULT '[]';
-- port 字段保留为"主端口"，取 exposed_ports[0].port，向后兼容

-- workspaces：模板与脚本编排
ALTER TABLE workspaces ADD COLUMN template_id TEXT;          -- 使用的模板（仅作来源标记）
ALTER TABLE workspaces ADD COLUMN template_params JSONB DEFAULT '{}';  -- 模板参数（可回显）
ALTER TABLE workspaces ADD COLUMN docker_uri TEXT;           -- 若模板为 docker-image，存镜像地址
ALTER TABLE workspaces ADD COLUMN startup_script TEXT;       -- 展开后的主脚本（快照）
```

**关于 `startup_script` 的取舍**：

| 方案 | 优点 | 缺点 |
|---|---|---|
| A. 只存 `userScripts` 引用 | 复用现有表，不冗余 | 用户改脚本影响存量工作区；无法保存"当时的配置" |
| B. 存快照 `startup_script` | 工作区自包含，行为可复现 | 与 `userScripts` 可能不一致 |
| **C. 双轨**（推荐） | `startup_script` 为快照（启动时用），并记录来源 `script_ids[]`；用户主动点"同步"时刷新 | 稍复杂，但最符合"可复现"诉求 |

**推荐 C**：启动时**只用快照**，保证行为稳定；UI 上提示"已同步/有更新"。

### 3.5 API 变更

| 方法 | 路径 | 变更 |
|---|---|---|
| `GET` | `/api/templates` | **新增**。返回模板列表 + 参数 schema |
| `POST` | `/api/templates/[id]/render` | **新增**。传参数，返回生成的脚本（预览用） |
| `POST` | `/api/instances/[id]/agent-ready` | **改**。body 增加 `ports`，写 `exposedPorts` |
| `GET` | `/api/instances/[id]` | **改**。返回 `exposedPorts` |
| `POST` | `/api/workspaces` | **改**。接受 `templateId` / `templateParams` / `startupScript` |
| `POST` | `/api/instance-scripts/startup` | **改**。注入自定义脚本编排（替换 `customScriptsLoop` 占位） |

---

## 四、代码改动清单

### 4.1 `agent/executor/runner.go` — 读取 ports.json

在脚本执行完成后新增：

```go
// 读取脚本声明的暴露端口
func readExposedPorts() []ExposedPort {
    const path = "/opt/agent/ports.json"
    data, err := os.ReadFile(path)
    if err != nil {
        return nil
    }
    var ports []ExposedPort
    if err := json.Unmarshal(data, &ports); err != nil {
        return nil
    }
    // 过滤非法端口
    valid := ports[:0]
    for _, p := range ports {
        if p.Port > 0 && p.Port <= 65535 {
            valid = append(valid, p)
        }
    }
    return valid
}
```

脚本执行前清理：

```go
func clearExposedPorts() {
    os.Remove("/opt/agent/ports.json")
}
```

### 4.2 `agent/main.go` — 调用 ReportReady

**这是当前最大的缺陷修复。** 在脚本成功的回调里补上：

```go
case executor.StatusSuccess:
    hb.SetStatus("ready")
    hb.SetActive(true)

    // 新增：读取暴露端口
    ports := exec.GetExposedPorts()
    if len(ports) == 0 {
        ports = []executor.ExposedPort{{Port: 8080, Label: "IDE", Protocol: "http"}}
    }

    // 新增：获取本机公网 IP
    publicIP := fetchPublicIP()  // 走 ECS 元数据 100.100.100.200

    // 新增：上报就绪（含端口）
    if err := r.ReportReady(publicIP, agentVersion, ports); err != nil {
        fmt.Printf("[agent] Failed to report ready: %v\n", err)
    }

    if err := r.ReportStatus("completed", "startup script completed successfully"); err != nil {
        fmt.Printf("[agent] Failed to report status: %v\n", err)
    }
```

`fetchPublicIP()` 实现：

```go
func fetchPublicIP() string {
    // ECS 元数据服务，仅内网可达，不需要凭证
    for _, url := range []string{
        "http://100.100.100.200/latest/meta-data/eipv4",
        "http://100.100.100.200/latest/meta-data/public-ipv4",
    } {
        if ip := httpGet(url, 2*time.Second); ip != "" {
            return ip
        }
    }
    return ""
}
```

### 4.3 `agent/reporter/reporter.go` — ReadyPayload 扩展

```go
type ExposedPort struct {
    Port     int    `json:"port"`
    Label    string `json:"label,omitempty"`
    Protocol string `json:"protocol,omitempty"`
}

type ReadyPayload struct {
    Token        string        `json:"token"`
    PublicIP     string        `json:"publicIp"`
    AgentVersion string        `json:"agent_version"`
    Ports        []ExposedPort `json:"ports"`   // 新增
}

func (r *Reporter) ReportReady(publicIP, agentVersion string, ports []ExposedPort) error {
    payload := ReadyPayload{
        Token:        r.token,
        PublicIP:     publicIP,
        AgentVersion: agentVersion,
        Ports:        ports,
    }
    return r.post("/agent-ready", payload)
}
```

### 4.4 `agent/heartbeat/manager.go` — 心跳带 IP

作为 `agent-ready` 失败时的兜底：

```go
payload := &reporter.HeartbeatPayload{
    Token:         m.reporter.GetToken(),
    PublicIP:      fetchPublicIP(),   // 新增（首次获取后缓存）
    Status:        status,
    // ...
}
```

同时在路由里补：若实例 `publicIp` 为空且心跳带了 IP，则回填。

### 4.5 `src/app/api/instances/[id]/agent-ready/route.ts`

```typescript
const portSchema = z.object({
  port: z.number().int().min(1).max(65535),
  label: z.string().optional(),
  protocol: z.enum(["http", "https", "tcp"]).optional(),
});

const bodySchema = z.object({
  token: z.string(),
  publicIp: z.string(),
  agent_version: z.string().optional(),
  ports: z.array(portSchema).default([{ port: 8080, label: "IDE", protocol: "http" }]),
});

// 写入
const primaryPort = body.ports[0]?.port ?? 8080;
await db.update(instances).set({
  status: "RUNNING",
  publicIp: body.publicIp,
  port: primaryPort,
  exposedPorts: body.ports,
  bootCompletedAt: new Date(),
  bootPhase: null,
  lastActiveAt: new Date(),
}).where(eq(instances.id, id));

// 同步个人访问码端口
const personal = await db.query.instanceAccessCodes.findFirst({
  where: and(
    eq(instanceAccessCodes.instanceId, id),
    eq(instanceAccessCodes.isPersonal, true),
  ),
});
if (personal) {
  await db.update(instanceAccessCodes)
    .set({ allowedPorts: body.ports.map((p) => p.port) })
    .where(eq(instanceAccessCodes.id, personal.id));
}
```

### 4.6 `src/app/api/instance-scripts/startup/route.ts` — 脚本编排

替换第 145 行的占位：

```typescript
// 拉取该工作区的自定义脚本（按 sortOrder）
const scripts = await db.query.instanceScripts.findMany({
  where: and(
    eq(instanceScripts.workspaceId, workspace.id),
    eq(instanceScripts.enabled, true),
  ),
  orderBy: [instanceScripts.sortOrder],
});

const customScriptsLoop = scripts.length
  ? scripts.map((s, i) => `
# === custom script ${i + 1}/${scripts.length}: ${s.name} ===
echo "[script] Running: ${s.name}"
(
${s.script}
) || { echo "[script] FAILED: ${s.name}"; exit 1; }
echo "[script] Done: ${s.name}"
`).join("\n")
  : `echo "[scripts] No custom scripts"`;
```

### 4.7 `scripts/startup.sh` — 移除捆绑安装

**当前 `startup.sh` 装了 Docker + Node.js + code-server + devcontainer CLI，这些不再属于平台职责。**

#### 保留（平台必需）

| 步骤 | 保留理由 |
|---|---|
| 代理引导 `{{PROXY_BOOTSTRAP}}` | 平台网络能力，用户脚本可能依赖 |
| `apt-get install curl jq git ca-certificates` | 最小工具集，用户脚本的基础依赖 |
| 执行自定义脚本 | **核心职责** |
| 写 ports.json 的默认兜底 | 保证无声明时也有入口 |
| 就绪上报 | 核心职责 |

#### 移除（移交给用户/模板）

| 步骤 | 去向 |
|---|---|
| 安装 Docker | → `docker-image` 模板负责装 |
| 安装 Node.js | → `node-app` 模板负责装 |
| 安装 code-server | → 用户脚本或镜像自带 |
| 安装 devcontainer CLI | → 移除，与"浏览器编辑器自带"目标冲突 |
| 写 devcontainer.json | → 移除 |
| `devcontainer up` | → 移除 |
| Features 循环 | → 冻结（表保留） |
| Git clone 块 | → 移入自定义脚本（用户自己控制 clone 时机） |

**理由**：这些安装步骤是"启动必然耗时"的主因（`apt-get` + 下载 Node + 下载 code-server，合计数分钟），且与"用户自己编排"的定位冲突。

### 4.8 `src/lib/templates/` — 新增模板引擎

```
src/lib/templates/
├── index.ts          # 模板注册表 + renderTemplate()
├── types.ts          # TemplateDefinition / TemplateParam
└── builtin/
    ├── docker-image.ts
    ├── static-site.ts
    ├── node-app.ts
    ├── python-app.ts
    └── custom.ts
```

类型定义：

```typescript
export interface TemplateParam {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default?: string | number | boolean;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  description?: string;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  params: TemplateParam[];
  render: (params: Record<string, unknown>) => string;
}
```

`docker-image` 模板示例：

```typescript
export const dockerImageTemplate: TemplateDefinition = {
  id: "docker-image",
  name: "启动 Docker 容器",
  description: "拉取并运行一个 Docker 镜像，自动暴露指定端口",
  params: [
    { key: "image", label: "镜像地址", type: "string", required: true,
      placeholder: "nginx:latest 或 registry.cn-hangzhou.aliyuncs.com/ns/repo:tag" },
    { key: "hostPort", label: "宿主端口", type: "number", default: 8080, required: true },
    { key: "containerPort", label: "容器端口", type: "number", default: 80, required: true },
    { key: "env", label: "环境变量", type: "string", placeholder: "KEY=VALUE,KEY2=VALUE2" },
    { key: "restart", label: "自动重启", type: "boolean", default: true },
  ],
  render: (p) => {
    const image = String(p.image ?? "");
    const hostPort = Number(p.hostPort ?? 8080);
    const containerPort = Number(p.containerPort ?? 80);
    const envArgs = String(p.env ?? "")
      .split(",")
      .filter(Boolean)
      .map((kv) => `-e ${kv.trim()}`)
      .join(" ");
    const restart = p.restart !== false ? "--restart unless-stopped" : "";

    return `#!/bin/bash
set -e

# 安装 Docker（如未安装）
if ! command -v docker >/dev/null 2>&1; then
  echo "[docker-image] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

echo "[docker-image] Pulling ${image}..."
docker pull ${image}

echo "[docker-image] Starting container..."
docker rm -f app 2>/dev/null || true
docker run -d --name app ${restart} ${envArgs} \\
  -p ${hostPort}:${containerPort} \\
  ${image}

# 声明暴露端口
cat > /opt/agent/ports.json <<'PORTS'
[{"port": ${hostPort}, "label": "App", "protocol": "http"}]
PORTS

echo "[docker-image] Ready on port ${hostPort}"
`;
  },
};
```

> **参数注入安全**：模板渲染必须对参数做转义（尤其 `image`、`env`），防止 shell 注入。`env` 需按 `KEY=VALUE` 格式校验 key 为 `[A-Za-z_][A-Za-z0-9_]*`。

### 4.9 前端改动

| 页面 | 改动 |
|---|---|
| 新建工作区向导 | 步骤改为：① 基础配置 → ② **选模板/自定义** → ③ 填参数（或写脚本）→ ④ 预览生成的脚本 → ⑤ 确认 |
| 工作区详情 | 显示模板来源；"查看/编辑脚本"入口 |
| 实例详情 / 访问页 | **展示 N 个端口入口**（当前只展示单个 `publicIp:port`） |
| 我的脚本 | 增加"从模板生成"按钮 |

**访问页多入口展示**（当前只渲染一个链接）：

```tsx
{snapshot.exposedPorts?.map((p) => (
  <a key={p.port} href={`http://${snapshot.publicIp}:${p.port}`} target="_blank">
    <span>{p.label ?? `端口 ${p.port}`}</span>
    <code>{snapshot.publicIp}:{p.port}</code>
    <span>{p.protocol}</span>
  </a>
))}
```

---

## 五、网络方案（精简版）

原 `ACR-PLAN.md` 的完整 ACR 方案在新定位下**大部分不需要了**。只保留一项：

### 5.1 agent 二进制分发改走 OSS（唯一必做项）

**理由**：`entrypoint.sh` 从 Vercel 拉 agent（`curl ${CALLBACK_URL}/agent-linux-amd64`）是**平台自己的行为**，不受"用户自负责"免责条款覆盖。且这一步失败会导致整个实例不可用。

**做法**：

```
构建时：npm run build:agent:all → 上传到 oss://<bucket>/agent/<version>/agent-linux-{amd64,arm64}
运行时：entrypoint.sh 从 oss-<region>-internal.aliyuncs.com 拉取
```

新增构建脚本 `scripts/publish-agent.sh`：

```bash
#!/bin/bash
set -e
VERSION=${1:-$(git rev-parse --short HEAD)}
npm run build:agent:all
for ARCH in amd64 arm64; do
  ossutil cp -f "public/agent-linux-${ARCH}" \
    "oss://${OSS_BUCKET}/agent/${VERSION}/agent-linux-${ARCH}"
done
echo "v${VERSION}" > /tmp/agent-version.txt
ossutil cp -f /tmp/agent-version.txt "oss://${OSS_BUCKET}/agent/latest.txt"
```

`entrypoint.sh` 改动：

```bash
# 原：AGENT_DOWNLOAD_URL="${CALLBACK_URL}/agent-linux-${AGENT_ARCH}"
AGENT_DOWNLOAD_URL="https://${OSS_BUCKET}.oss-${REGION}-internal.aliyuncs.com/agent/${AGENT_VERSION}/agent-linux-${AGENT_ARCH}"
```

> 注意：OSS 内网 endpoint 需要 ECS 与 OSS 同地域。跨地域会走公网且计费。
> 若 bucket 为私有，需用 RAM 角色签名 URL，或在 bucket 上开只读公共策略（不推荐）。

### 5.2 ACR 降级为可选

用户如果在脚本里用自己的 ACR 拉镜像，`workspace.region` 对应的 `registry.<region>.aliyuncs.com` 已在 `startup/route.ts:116` 有条件登录逻辑，**保留即可**，但不作为平台保证的能力。

### 5.3 不做的事

| 项 | 理由 |
|---|---|
| 平台维护镜像市场 | 定位已变，冻结 |
| 自动导入镜像到 ACR | 同上 |
| Registry 仓库（`docs/REGISTRY.md`） | 冻结，不投入 |

---

## 六、实施顺序

| 阶段 | 内容 | 优先级 |
|---|---|---|
| **Phase 1** | 修 `agent-ready` 缺陷：agent 补 `ReportReady` 调用 + 元数据取 IP | **P0**（当前实例会卡在 BOOTING） |
| **Phase 2** | ports.json 契约：agent 读取 + 后端 `exposedPorts` + 前端多入口 | **P0**（核心新能力） |
| **Phase 3** | 模板引擎 `src/lib/templates/` + 5 个内置模板 | **P1** |
| **Phase 4** | `startup.sh` 瘦身（移除 Docker/Node/code-server/devcontainer 安装） | **P1** |
| **Phase 5** | 脚本编排：`instanceScripts` 接入启动链路 | **P1** |
| **Phase 6** | 新建工作区向导重构（模板选择 + 脚本编辑 + 预览） | **P2** |
| **Phase 7** | agent 二进制改走 OSS | **P2** |
| **Phase 8** | 文档同步：修订 PLAN.md / ARCHITECTURE.md 中已冻结的章节 | **P2** |

**Phase 1 必须最先做**：在修复前，任何新实例都可能卡在 `BOOTING`，Phase 2-6 都无法验证。

---

## 七、验收标准

| 场景 | 验收条件 |
|---|---|
| Docker 模板 | 选模板 → 填 `nginx:latest` → 启动 → 3 分钟内访问页出现 `http://IP:8080` 且返回 nginx 欢迎页 |
| 自定义脚本 | 写一段 `python3 -m http.server 9000 --directory /tmp` → 启动 → 访问页出现 9000 入口且可达 |
| 多端口 | 脚本写 `ports.json` 声明 3 个端口 → 访问页展示 3 个入口，均可访问 |
| 无声明兜底 | 脚本不写 `ports.json` → 访问页仍展示 8080 入口 |
| 失败可见 | 脚本第 3 行 `exit 1` → 实例状态 `FAILED`，日志可见失败位置 |

---

## 八、待确认问题

| # | 问题 | 影响 |
|---|---|---|
| Q1 | `startup.sh` 瘦身后，**新的默认编辑器是什么**？用户自行安装（如 `curl -fsSL https://code-server.dev/install.sh \| sh`），还是提供一个预装 code-server 的镜像让用户选？ | 决定"选模板即用"的最低门槛 |
| Q2 | 端口协议用 `http/tcp` 是否够？是否需要 `https`？（当前无 TLS 终结） | 影响 `ports.json` schema |
| Q3 | `resources.ossBucket` 当前是硬编码 `my-dev-workspace-${region}`（`startup/route.ts:161`），是否与实际 OSS 命名一致？ | 决定 Phase 7 能否落地 |
| Q4 | 模板参数是否需要支持"数组"类型（如多个 volume 挂载）？ | 影响参数表单复杂度 |
| Q5 | 自定义脚本失败时，是否要保留实例供用户调试？还是直接销毁？ | 影响状态机设计 |

---

## 九、与旧文档的关系

| 文档 | 处置 |
|---|---|
| `docs/ACR-PLAN.md` | **作废**。仅在 §5 保留"agent 走 OSS"一项 |
| `docs/REGISTRY.md` | **冻结**。不删除，不再投入 |
| `docs/ARCHITECTURE.md` | §1.2 资源管理、§5 Registry、§六 P1/P2 任务需修订 |
| `docs/PLAN.md` | D2（code-server 容器）、D6（Features 安装位置）、D7（漫游配置）需重新评估 |
| `docs/INSTANCE-PLAN.md` | 基本仍有效，需补 `exposedPorts` |
| `docs/agent-design.md` | §十七 变更记录需补 v1.1：新增 ports.json 契约与 ReportReady 修复 |
