import { and, eq, gt, desc } from "drizzle-orm";
import { isIP } from "node:net";
import { db } from "@/lib/db";
import {
  instanceAccessCodes,
  instanceLogs,
  instances,
  workspaces,
  cloudInstances,
} from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import {
  authorizeIngress,
  describeSecurityGroupRules,
  ruleExists,
} from "@/lib/aliyun/ecs";
import type { CloudInstanceType } from "@/lib/providers/types";
import { ALL_PORTS } from "@/lib/constants";

export class AccessError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = "AccessError";
  }
}

/** 端口数组（含 ALL_PORTS=0 哨兵）展开为安全组授权用的 PortRange。 */
export function toPortRanges(allowedPorts: number[] | null | undefined): string[] {
  if (!allowedPorts || allowedPorts.length === 0) return ["8080/8080"];
  if (allowedPorts.includes(ALL_PORTS)) return ["1/65535"];
  return allowedPorts.map((p) => `${p}/${p}`);
}

/** 从转发头/远端地址提取访问者公网 IP。 */
export function extractVisitorIp(
  xRealIp: string | null,
  xForwardedFor: string | null,
  remoteAddr: string | null,
): string | null {
  if (xRealIp && xRealIp.trim()) return xRealIp.trim().split(",")[0].trim();
  if (xForwardedFor && xForwardedFor.trim()) {
    return xForwardedFor.trim().split(",")[0].trim();
  }
  if (remoteAddr) {
    const host = remoteAddr.split(":")[0].trim();
    return host || null;
  }
  return null;
}

/** 校验访问码属于该实例且未过期/未超次数。 */
export async function validateAccessCode(
  instanceId: string,
  code: string,
) {
  const accessCode = await db.query.instanceAccessCodes.findFirst({
    where: and(
      eq(instanceAccessCodes.instanceId, instanceId),
      eq(instanceAccessCodes.code, code),
    ),
  });
  if (!accessCode) throw new AccessError("无效的访问码", 404);
  if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
    throw new AccessError("访问码已过期", 410);
  }
  if (
    accessCode.maxUses != null &&
    (accessCode.useCount ?? 0) >= accessCode.maxUses
  ) {
    throw new AccessError("访问码使用次数已达上限", 403);
  }
  return accessCode;
}

/**
 * 把访问者 IP 加入实例专属安全组（幂等）。
 * 返回是否新登记（新登记时调用方会把 useCount +1）。
 */
export async function registerVisitorIp(
  instanceId: string,
  code: string,
  ip: string,
): Promise<{ registered: boolean }> {
  const ipVersion = isIP(ip);
  if (ipVersion === 0) return { registered: false };

  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) throw new AccessError("实例不存在", 404);
  if (!instance.securityGroupId) {
    // 存量实例没有专属安全组，无法登记白名单
    return { registered: false };
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, instance.workspaceId),
  });
  if (!workspace) throw new AccessError("工作区不存在", 404);

  const accessCode = await validateAccessCode(instanceId, code);
  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new AccessError("Unknown provider", 500);
  }
  const creds = await provider.getCredentials(workspace.userId);

  const cidr = `${ip}/32`;
  const ranges = toPortRanges(accessCode.allowedPorts);
  const existingRules = await describeSecurityGroupRules(
    creds,
    workspace.region,
    instance.securityGroupId,
  );

  let registered = false;
  for (const portRange of ranges) {
    if (ruleExists(existingRules, portRange, cidr)) continue;
    await authorizeIngress(
      creds,
      workspace.region,
      instance.securityGroupId,
      portRange,
      cidr,
      `access ${code}`,
    );
    registered = true;
  }
  return { registered };
}

// 短缓存避免频繁调用 getInstanceTypes（aliyun 侧无缓存）
const specCache = new Map<string, { expiresAt: number; types: CloudInstanceType[] }>();
const SPEC_TTL_MS = 60 * 60 * 1000;

async function resolveInstanceType(
  workspace: typeof workspaces.$inferSelect,
  instanceType: string,
): Promise<CloudInstanceType | null> {
  const key = `${workspace.provider}:${workspace.region}`;
  const hit = specCache.get(key);
  let types: CloudInstanceType[];
  if (hit && hit.expiresAt > Date.now()) {
    types = hit.types;
  } else {
    try {
      const provider = getProvider(workspace.provider);
      if (!provider) {
        return null;
      }
      types = await provider.getInstanceTypes(workspace.region);
    } catch {
      return null;
    }
    specCache.set(key, { expiresAt: Date.now() + SPEC_TTL_MS, types });
  }
  return types.find((t) => t.id === instanceType) ?? null;
}

/** 单个对外可用端口（访问页据此渲染多端口按钮，§6.2）。 */
export interface AccessPort {
  port: number;
  label: string;
  protocol: string;
  /** 私有端口仅对已登记白名单的访客可见/可点（如内部 DB 端口）。 */
  private: boolean;
}

export interface AccessSnapshot {
  status: string;
  bootPhase: string | null;
  bootError: string | null;
  cloudStatus: string | null;
  publicIp: string | null;
  port: number | null;
  bootStartedAt: string | null;
  bootCompletedAt: string | null;
  createdAt: string | null;
  workspaceName: string;
  imageUri: string | null;
  region: string;
  provider: string;
  instanceType: string | null;
  cpu: number | null;
  memoryMb: number | null;
  diskSize: number;
  bandwidth: number;
  allowedPorts: number[];
  /** 模板声明的业务端口（来自 metadata.activity.ports ∪ agent 运行时覆盖）。 */
  ports: AccessPort[];
  /** 当前入口文件名（模板场景），用于页面展示。 */
  currentEntry: string | null;
  logs: {
    timestamp: string;
    level: string;
    phase: string | null;
    message: string;
  }[];
}

/**
 * 汇总对外端口列表（§6.2 两条来源）。
 *
 *   来源 A：workspace.activityConfig.ports —— 模板 metadata 声明，构建期就已知
 *   来源 B：instance.accessSummary.ports —— agent 运行时上报，可覆盖 A
 *
 * B 优先级更高（agent 更了解真实监听情况），但仅当它是合法声明时才覆盖；
 * 同一端口以 B 为准，A 中未被覆盖的项保留。结果按端口号升序，保证按钮顺序稳定。
 */
function collectPorts(
  declared: { port: number; label?: string; protocol?: string; private?: boolean }[] | null | undefined,
  runtime: unknown,
): AccessPort[] {
  const byPort = new Map<number, AccessPort>();

  const push = (
    raw: { port?: unknown; label?: unknown; protocol?: unknown; private?: unknown },
    source: "declared" | "runtime",
  ) => {
    const port = Number(raw.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    const existing = byPort.get(port);
    // runtime 覆盖 declared；同源后者不覆盖前者
    if (existing && source === "declared") return;
    byPort.set(port, {
      port,
      label: typeof raw.label === "string" && raw.label ? raw.label : `:${port}`,
      protocol: typeof raw.protocol === "string" && raw.protocol ? raw.protocol : "tcp",
      private: raw.private === true,
    });
  };

  for (const d of declared ?? []) push(d, "declared");

  if (Array.isArray(runtime)) {
    for (const r of runtime) {
      if (r && typeof r === "object") push(r as Record<string, unknown>, "runtime");
    }
  }

  return [...byPort.values()].sort((a, b) => a.port - b.port);
}

/** 组装公开访问页所需的实例快照（轮询用，不要求登录）。
 * 默认不查询 ECS 实时状态以保证首屏秒开；includeCloud 为 true 时补充云状态。
 */
export async function buildAccessSnapshot(
  instanceId: string,
  code: string,
  since?: string,
  includeCloud = false,
): Promise<AccessSnapshot> {
  const accessCode = await validateAccessCode(instanceId, code);

  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) throw new AccessError("实例不存在", 404);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, instance.workspaceId),
  });
  if (!workspace) throw new AccessError("工作区不存在", 404);

  const cloudInstance = instance.cloudInstanceId
    ? await db.query.cloudInstances.findFirst({
        where: eq(cloudInstances.id, instance.cloudInstanceId),
      })
    : null;

  let cloudStatus: string | null = null;
  if (
    includeCloud &&
    ["PROVISIONING", "BOOTING"].includes(instance.status) &&
    instance.ecsInstanceId
  ) {
    const provider = getProvider(workspace.provider);
    if (provider) {
      cloudStatus = await provider.getInstanceCloudStatus(
        instance.ecsInstanceId,
        workspace.region,
      );
    }
  }

  let spec: CloudInstanceType | null = null;
  if (cloudInstance?.instanceType) {
    spec = await resolveInstanceType(workspace, cloudInstance.instanceType);
  }

  const logRows = since
    ? await db.query.instanceLogs.findMany({
        where: and(
          eq(instanceLogs.instanceId, instanceId),
          gt(instanceLogs.timestamp, new Date(since)),
        ),
        orderBy: [desc(instanceLogs.timestamp)],
        limit: 100,
      })
    : await db.query.instanceLogs.findMany({
        where: eq(instanceLogs.instanceId, instanceId),
        orderBy: [desc(instanceLogs.timestamp)],
        limit: 100,
      });
  const logs = [...logRows].reverse().map((l) => ({
    timestamp: l.timestamp.toISOString(),
    level: l.level,
    phase: l.phase,
    message: l.message,
  }));

  // 运行时端口：agent 心跳把 $WS_EXPOSED_PORTS_FILE 的内容塞在 accessSummary.ports
  const runtimePorts = (() => {
    const summary = instance.accessSummary;
    if (summary && typeof summary === "object" && "ports" in summary) {
      return (summary as { ports?: unknown }).ports;
    }
    return undefined;
  })();

  const ports = collectPorts(workspace.activityConfig?.ports, runtimePorts);

  return {
    status: instance.status,
    bootPhase: instance.bootPhase,
    bootError: instance.bootError,
    cloudStatus,
    publicIp: instance.publicIp,
    port: instance.port,
    bootStartedAt: instance.bootStartedAt?.toISOString() ?? null,
    bootCompletedAt: instance.bootCompletedAt?.toISOString() ?? null,
    createdAt: instance.createdAt?.toISOString() ?? null,
    workspaceName: workspace.name,
    imageUri: workspace.imageUri,
    region: workspace.region,
    provider: workspace.provider,
    instanceType: cloudInstance?.instanceType ?? null,
    cpu: spec?.cpu ?? null,
    memoryMb: spec?.memory ?? null,
    diskSize: instance.diskSize,
    bandwidth: instance.bandwidth,
    allowedPorts: accessCode.allowedPorts ?? [8080],
    ports,
    currentEntry: instance.currentEntry,
    logs,
  };
}