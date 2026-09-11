# ACR 镜像加速接入方案

> ⚠️ **本文档已作废（2026-09-11）**
>
> 原因：项目定位已从「镜像市场」调整为「脚本编排优先」，平台不再负责镜像分发。
> 请以 [SCRIPT-FIRST-PLAN.md](SCRIPT-FIRST-PLAN.md) 为准。
>
> 本文档保留的历史价值：**见 §5 的「agent 二进制走 OSS 内网」一项**，该结论在新方案中仍然成立并被采纳。
> 其余章节（ACR 企业版选型、镜像同步、免密拉取细节）在新定位下不再需要。

---

> 目标：解决国内网络环境下，ECS 实例启动时拉取 Docker 镜像与启动产物慢/失败的问题。
> 结论：**ACR 是必要但不充分条件** —— 镜像走 ACR，agent 与脚本走同地域 OSS 内网，两者必须同时做。

---

## 〇、问题定位（先看这一节）

### 0.1 现状链路

```
后端 createInstance()
  → ECS RunInstances(userData = entrypoint.sh 的 base64)
  → ECS 首次启动执行 entrypoint.sh
      ├─ curl ${CALLBACK_URL}/api/instance-scripts/startup   ← Vercel 公网
      ├─ curl ${CALLBACK_URL}/agent-linux-amd64              ← Vercel 公网
      └─ 启动 agent → agent 执行 startup.sh
          └─ docker pull <imageUri>                          ← docker.io / ghcr.io 直连
```

### 0.2 根因

| 环节 | 现状 | 问题 |
|---|---|---|
| 镜像拉取 | ECS 直连 `docker.io` / `ghcr.io` | 国内基本不可用，超时/失败 |
| agent 二进制 | 从 Vercel 公网拉 | 跨境链路慢（约 10MB，尚可忍受但不可靠） |
| startup 脚本 | 从 Vercel 公网拉 | 小文件，影响较小 |
| Docker 加速器 | `settings.dockerMirror` 字段存在但**未被 entrypoint 使用** | 配置形同虚设 |

**关键结论**：`src/lib/instances/service.ts` 的 `createInstance()` 中，`imageUri` **没有被后端消费**；镜像拉取完全依赖 ECS 内的 startup.sh。这意味着后端无法控制拉取策略，也无法注入加速配置。

---

## 一、ACR 版本选型（成本决策点）

| 能力 | 个人版 | 企业版-经济版 | 企业版-基础版 | 企业版-标准版 |
|---|---|---|---|---|
| 价格 | 免费 | **45 元/月** | 564 元/月 | 1390 元/月 |
| 拉取 QPS | 不保障 | 30 | 250 | 500 |
| 免密拉取 | 受限（需新版实例） | 支持 | 支持 | 支持 |
| P2P 分发 | 无 | 无 | 支持 | 支持 |
| VPC 内网访问 | 支持 | 支持 | 支持 | 支持 |
| OpenAPI | **不对外提供** | 提供 | 提供 | 提供 |
| 命名空间配额 | 3 | 5 | 15 | 25 |

### 选型结论

**推荐：企业版-经济版（45 元/月）**

理由：
1. **必须有 OpenAPI** —— 项目 `src/lib/aliyun/acr.ts` 的 `ListInstance` / `CreateInstance` / `ListRepository` / `ListRepositoryTag` 全部基于 OpenAPI。个人版不提供 OpenAPI，这 4 个函数对个人版无效。
2. 45 元/月的成本对于"个人自部署"定位可接受，且是唯一带 OpenAPI 的低价档。
3. 30 QPS 对单用户按需创建实例的场景完全够用（一个实例一次拉取）。

**但注意两点**：

- 2025-12 有公告《ACR 个人版 OpenAPI 服务接入点请求机制变更》——若你确实想用个人版，需去控制台核实其 OpenAPI 当前可用性。
- 2026-04 有公告《个人版免密功能机制变更》。免密拉取是你这个架构的刚需（ECS 内不存 AK），个人版这条链路有变更风险。

**替代方案（0 成本）**：不开 ACR，改用 Docker 官方/第三方镜像加速器（`settings.dockerMirror` 注入到 ECS 的 `daemon.json`）。缺点：加速器只对 `docker.io` 生效，对 `ghcr.io` 无效，且第三方加速器稳定性无保障。**建议作为 ACR 未就绪前的过渡，不作为长期方案。**

---

## 二、目标架构

### 2.1 三层分发

| 层 | 内容 | 载体 | 拉取方式 |
|---|---|---|---|
| 镜像层 | code-server 及用户自定义镜像 | ACR 企业版 | VPC 内网域名 + 免密 |
| 二进制层 | agent-linux-amd64 / arm64 | 同地域 OSS | OSS 内网 endpoint |
| 脚本层 | startup.sh / stop-hook.sh | 同地域 OSS | OSS 内网 endpoint |

### 2.2 启动链路（改造后）

```
后端 createInstance()
  ├─ 生成 instance 记录 + accessToken
  ├─ 查询 ACR 内网域名（按 region）
  ├─ 上传/复用 OSS 中的 agent + startup 脚本
  └─ ECS RunInstances(
       userData = entrypoint.sh,
       ramRoleName = workspace-cloud-ecs-role   ← 免密关键
     )
       ↓
     entrypoint.sh
       ├─ 从 OSS 内网拉 agent + 脚本
       ├─ 生成 /etc/docker/daemon.json（指向 ACR 内网）
       ├─ docker login --username=<RAM角色> （或免密组件）
       └─ docker pull <ACR内网地址>/<ns>/<repo>:<tag>
```

### 2.3 免密拉取方案（推荐）

ECS 已绑定 `RAM_ROLE_NAME`（见 `service.ts` 第 174 行 `ramRoleName: RAM_ROLE_NAME`），这是免密的基础。

两种实现：

| 方案 | 做法 | 优缺点 |
|---|---|---|
| **A. 实例 RAM 角色 + docker login** | entrypoint 中 `docker login` 使用 STS 临时凭证 | 无额外组件，需处理凭证过期 |
| **B. ACR 免密组件** | 安装 ACR credential helper | 官方推荐，但需 ACR 实例与 ECS 网络打通 |

**推荐 A**：项目已有 RAM 角色，改动最小。在 entrypoint.sh 中用 ECS 元数据服务获取 STS 凭证：

```bash
RAM_ROLE="workspace-cloud-ecs-role"
STS=$(curl -s "http://100.100.100.200/latest/meta-data/ram/security-credentials/${RAM_ROLE}")
ACCESS_KEY_ID=$(echo "$STS" | grep -o '"AccessKeyId":"[^"]*"' | cut -d'"' -f4)
ACCESS_KEY_SECRET=$(echo "$STS" | grep -o '"AccessKeySecret":"[^"]*"' | cut -d'"' -f4)
SECURITY_TOKEN=$(echo "$STS" | grep -o '"SecurityToken":"[^"]*"' | cut -d'"' -f4)

docker login <ACR内网域名> \
  -u "$ACCESS_KEY_ID" -p "$ACCESS_KEY_SECRET" 2>/dev/null || true
```

> 注意：`docker login` 不支持 STS Token 参数，需改用 `--password-stdin` + `auths` 配置，或在 `daemon.json` 中配置 `credHelpers`。**需在实现阶段验证。**

### 2.4 需要的 RAM 权限

在 `workspace-cloud-ecs-role` 角色上追加：

```
cr:GetAuthorizationToken
cr:ListInstanceEndpoint
cr:PullRepository     # 或走免密
```

---

## 三、代码改动清单

### 3.1 `src/lib/aliyun/acr.ts` — 补充内网域名与授权

新增：

```typescript
// 查询实例的 VPC 内网访问域名
export async function getVpcEndpoint(
  creds: AliCredentials, region: string, instanceId: string,
): Promise<string | null> {
  const res = await request<{
    endpoints?: { endpoint?: { endpointType: string; domains?: { domain?: { domain: string }[] } }[] };
  }>(creds, region, "ListInstanceEndpoint", { InstanceId: instanceId });
  const vpc = res.endpoints?.endpoint?.find((e) => e.endpointType === "VPC");
  return vpc?.domains?.domain?.[0]?.domain ?? null;
}

// 获取临时访问凭证（用于免密拉取）
export async function getAuthorizationToken(
  creds: AliCredentials, region: string, instanceId: string,
): Promise<{ username: string; token: string; expireTime: number } | null> {
  const res = await request<{
    authorizationToken?: string; tempUserName?: string; expireTime?: number;
  }>(creds, region, "GetAuthorizationToken", { InstanceId: instanceId });
  return res.authorizationToken
    ? { username: res.tempUserName ?? "", token: res.authorizationToken, expireTime: res.expireTime ?? 0 }
    : null;
}
```

**现存问题**：`createInstance()` 与 `listInstances()` 中 `region` 参数被传入但 `request()` 未使用（仅用 `acrEndpoint()` 固定 endpoint）。企业版实例按地域分布，此逻辑需修正为使用地域化 endpoint。

### 3.2 `src/lib/ecs/provisioning.ts` — 增加 ACR 前置校验

启动前校验：
1. 用户在设置中已配置 `acrInstanceId`
2. 该 ACR 实例处于 `Running`
3. 目标 region 下 ACR 实例存在（企业版实例是地域级的）

校验失败应给出明确错误，而不是让 ECS 启动后在容器里超时。

### 3.3 `src/lib/userdata.ts` — 重写 entrypoint 注入

`EntrypointVars` 扩展：

```typescript
export interface EntrypointVars {
  instanceId?: string;
  callbackUrl: string;        // 保留：后端回调
  accessToken: string;
  // 新增
  ossEndpoint: string;        // OSS 内网 endpoint，如 oss-cn-hangzhou-internal.aliyuncs.com
  ossBucket: string;
  ossPrefix: string;          // 如 agent/v1.0.0/
  acrRegistry: string;        // ACR VPC 内网域名
  imageUri: string;           // 完整镜像地址（已含 ACR 域名）
  ramRoleName: string;
}
```

`buildEntrypoint()` 的替换规则同步扩展。

### 3.4 `scripts/entrypoint.sh` — 核心改造

替换点：

| 原逻辑 | 新逻辑 |
|---|---|
| `curl ${CALLBACK_URL}/agent-linux-${ARCH}` | `curl http://${OSS_ENDPOINT}/agent/vX/agent-linux-${ARCH}`（内网，带签名或走 RAM 角色） |
| `curl ${CALLBACK_URL}/api/instance-scripts/startup` | 从 OSS 拉 `ws-{id}/startup.sh` |
| agent 内部 `docker pull ${imageUri}` | 改为 ACR 内网地址，并在拉取前写 `daemon.json` |

新增步骤（在拉取镜像前）：

```bash
# === 配置 Docker 加速 / ACR 内网 ===
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<DAEMON
{
  "registry-mirrors": ["https://<mirror>.mirror.aliyuncs.com"],
  "insecure-registries": [],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
DAEMON
systemctl restart docker

# === ACR 免密登录 ===
<见 2.3 节>
```

### 3.5 `src/lib/instances/service.ts` — 传递新参数

在 `createInstance()` 中（第 155-162 行附近）：

```typescript
const s = await getUserSettings(userId);
const acrRegistry = await resolveAcrRegistry(creds, workspace.region, s.acrInstanceId);
if (!acrRegistry) throw new InstanceError("ACR 未配置或该地域无实例", 400);

const entrypointVars: EntrypointVars = {
  instanceId: instance.id,
  callbackUrl,
  accessToken: instance.accessToken!,
  ossEndpoint: ossInternalEndpoint(workspace.region),
  ossBucket: s.ossBucket!,
  ossPrefix: AGENT_VERSION_PREFIX,
  acrRegistry,
  imageUri: rewriteToAcr(workspace.imageUri, acrRegistry),
  ramRoleName: RAM_ROLE_NAME,
};
```

**`rewriteToAcr()` 逻辑**：市场镜像的 URI 是 `docker.io/library/node:22`，需映射为 ACR 中对应的仓库地址。这就引出下一步。

### 3.6 Registry 与镜像同步（关键设计）

市场镜像来自公开仓库，ACR 里必须先有副本。三个选项：

| 方案 | 做法 | 评价 |
|---|---|---|
| **A. ACR 镜像极速导入** | 用 ACR 控制台/API 把 `docker.io/library/node:22` 导入 ACR | 一次性操作，简单；但换版本需重新导入 |
| **B. 后台代理拉取 + 推送** | 后端/CI 拉取后推送到 ACR | 需要海外带宽或代理，成本高 |
| **C. 用户自助** | 用户自己在 ACR 里导入镜像后再用 | 最省事，但体验差，违背"选模板即用"目标 |

**推荐 A + 按需触发**：
- 市场安装镜像时（`POST /api/user-images`），若来源是 marketplace，自动触发一次 ACR 导入
- `docs/ARCHITECTURE.md` 中「镜像同步 = 用户自建，不自动同步」的决策需要修改

`registry/images/*.json` 需增加字段：

```json
{
  "id": "node-22",
  "uri": "docker.io/library/node:22",
  "acrRepo": "library/node:22",     // 新增：ACR 中的仓库路径
  "synced": false                    // 新增：是否已导入 ACR
}
```

### 3.7 `src/lib/db/schema.ts` — 字段补充

`settings` 表已有 `acrInstanceId`，建议补充：

```sql
ALTER TABLE settings ADD COLUMN acr_registry TEXT;          -- 缓存的内网域名
ALTER TABLE settings ADD COLUMN acr_endpoint_region TEXT;   -- 域名所属地域
ALTER TABLE settings ADD COLUMN agent_version TEXT;         -- 当前 agent 版本
```

`user_images` 表补充同步状态：

```sql
ALTER TABLE user_images ADD COLUMN acr_synced BOOLEAN DEFAULT FALSE;
ALTER TABLE user_images ADD COLUMN acr_sync_error TEXT;
```

---

## 四、实施顺序

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **Phase 0** | 控制台创建 ACR 企业版实例（经济版），开通 OSS，配置 RAM 角色 | 无 |
| **Phase 1** | `acr.ts` 补 `getVpcEndpoint` / `getAuthorizationToken`，修正地域化 endpoint | Phase 0 |
| **Phase 2** | agent 二进制 + startup 脚本上传 OSS 的构建脚本（`scripts/publish-agent.sh`） | Phase 0 |
| **Phase 3** | 重写 `entrypoint.sh`：OSS 内网拉取 + daemon.json + ACR 登录 | Phase 1, 2 |
| **Phase 4** | `service.ts` 传递新参数 + `provisioning.ts` 增加 ACR 校验 | Phase 3 |
| **Phase 5** | 市场镜像 → ACR 导入触发链路 + Registry 字段扩展 | Phase 0 |
| **Phase 6** | 端到端验证：创建实例 → 观察日志 → 计时 | 全部 |

**Phase 6 验收标准**：从 `RunInstances` 到 agent 上报 READY，**总耗时 < 3 分钟**（当前预期 > 15 分钟或直接失败）。

---

## 五、风险与待确认项

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | 个人版无 OpenAPI，现有 `acr.ts` 失效 | 高 | 用企业版经济版，或核实个人版 OpenAPI 现状 |
| R2 | 免密拉取的 STS 凭证在 `docker login` 中的传递方式未验证 | 高 | Phase 3 做 PoC 验证，备选 `credHelpers` |
| R3 | ACR 企业版实例是地域级的，多地域部署需多实例 | 中 | 45 元/月 × 地域数，或限定单地域可用 |
| R4 | 市场镜像需先导入 ACR，首次使用有延迟 | 中 | 导入动作在"安装到我的镜像"时触发，与用户操作错峰 |
| R5 | `ListInstanceEndpoint` 等 API 的实际返回结构与假设不符 | 中 | Phase 1 先用真实 AK 调通再写封装 |
| R6 | ACR 企业版实例创建约需 2-3 分钟 | 低 | 属一次性成本，不影响运行时 |
| R7 | 已有的 `dockerMirror` 设置字段未使用 | 低 | 本次改造中接入 `daemon.json`，顺带修复 |

### 必须你确认的三件事

1. **ACR 版本**：接受 45 元/月的企业版经济版，还是坚持先试个人版（有 OpenAPI 不可用风险）？
2. **面向地域**：你的目标用户是单地域（如仅 cn-hangzhou）还是多地域？多地域意味着多份 ACR 实例费。
3. **镜像同步**：接受"安装镜像时自动导入 ACR"，还是希望完全手动管理？

---

## 六、与既有决策的冲突点

本次方案与 `docs/ARCHITECTURE.md` 的以下决策冲突，需同步修订：

| 原文决策 | 冲突 | 建议 |
|---|---|---|
| 七、关键决策：「镜像同步 = 用户自建，不自动同步」 | 与 ACR 加速目标矛盾 | 改为「marketplace 镜像自动导入 ACR，custom 镜像由用户自行导入」 |
| 一、1.1：「镜像 = 基础环境，可缓存到用户 ACR 秒拉」 | 已预见 ACR，但未落地 | 本次改造即落地该表述 |
