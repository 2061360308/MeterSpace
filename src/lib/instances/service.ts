import { randomBytes } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  instances,
  instanceLogs,
  instanceAccessCodes,
  workspaces,
  auditLogs,
  cloudInstances,
} from "@/lib/db/schema";
import { buildStopHook } from "@/lib/userdata";
import { dispatchPreStop } from "@/lib/agent/command";
import { ALL_PORTS } from "@/lib/constants";
import { enqueueTracking } from "@/lib/instances/enqueue";
import { cleanupExpiredLogs, provisionInstanceCloud } from "./lifecycle";

export class InstanceError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = "InstanceError";
  }
}

function generateAccessToken(): string {
  return randomBytes(16).toString("hex");
}

function generateAccessCode(): string {
  return `inst_${randomBytes(12).toString("hex")}`;
}

export interface CreateInstanceInput {
  cloudInstanceId?: string;
  diskSize?: number;
  bandwidth?: number;
  spotStrategy?: string;
  spotDuration?: number;
  spotPriceLimit?: number | null;
}

export async function createInstance(
  userId: string,
  workspaceId: string,
  input: CreateInstanceInput,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new InstanceError("Workspace not found", 404);

  const runningInstance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "RUNNING"),
    ),
  });
  if (runningInstance) {
    throw new InstanceError("Workspace already has a running instance", 409);
  }

  // 检查是否有未超时的 PROVISIONING/BOOTING 实例
  const activeInstance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "PROVISIONING"),
    ),
  });
  if (activeInstance) {
    throw new InstanceError("Workspace already has a provisioning instance", 409);
  }

  const bootingInstance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "BOOTING"),
    ),
  });
  if (bootingInstance) {
    throw new InstanceError("Workspace already has a booting instance", 409);
  }

  const cloudInstanceId = input.cloudInstanceId;
  if (!cloudInstanceId) {
    throw new InstanceError("请先选择弹性规格", 400);
  }

  const cloudInstance = await db.query.cloudInstances.findFirst({
    where: eq(cloudInstances.id, cloudInstanceId),
  });
  if (!cloudInstance) throw new InstanceError("Cloud instance not found", 404);

  const diskSize = input.diskSize ?? workspace.defaultDiskSize ?? 40;
  const bandwidth = input.bandwidth ?? workspace.defaultBandwidth ?? 10;

  const [instance] = await db
    .insert(instances)
    .values({
      workspaceId,
      cloudInstanceId,
      diskSize,
      bandwidth,
      // 落库：真正的 ECS 创建发生在异步的 resumeProvisioning，
      // 不存下来那边就只能硬编码（原先的 bug：勾了抢占却建成按量付费实例）。
      useSpot: Boolean(input.spotStrategy && input.spotStrategy !== "NoSpot"),
      status: "PROVISIONING",
      accessToken: generateAccessToken(),
      bootStartedAt: new Date(),
    })
    .returning();

  const personalCode = generateAccessCode();
  await db.insert(instanceAccessCodes).values({
    instanceId: instance.id,
    code: personalCode,
    isPersonal: true,
    allowedPorts: [ALL_PORTS],
  });

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "INSTANCE_CREATE",
    details: {
      instanceId: instance.id,
      diskSize,
      bandwidth,
      instanceType: cloudInstance.instanceType,
    },
  });

  // ☞ 云资源创建（ECS）**在这里同步跑完**（U9 反转）。
  //
  //   原先为了不让按钮长时间转圈，只落一行 PROVISIONING 就返回，真正的创建
  //   甩给 maintenance tick。代价是：参数必须全部落库（漏一个就静默失效，
  //   如 use_spot），而且用户一关页面实例就根本不会被创建。
  //
  //   现在基础网络资源已落库（region_resources），建 ECS 只剩 2 次云 API、1~3 秒，
  //   完全可以放在请求里跑完：
  //     - 参数从入参直接取，不必再落库（结构上杜绝「参数漏存」类 bug）
  //     - 失败立刻返回错误，用户当场看到原因，而不是后台静默标 FAILED
  //     - 不再依赖前端开着页面推进
  //
  //   原本由 maintenance tick 兜底的孤儿行改由这段同步创建 + 云函数 poll 驱动
  //   （docs/CLOUD-FUNCTION-WORKERS.md §2）。
  try {
    await provisionInstanceCloud(instance.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[instances] createInstance: cloud provisioning failed:", message);
    await db
      .update(instances)
      .set({ status: "FAILED", bootError: message, updatedAt: new Date() })
      .where(eq(instances.id, instance.id));
    throw new InstanceError(`创建云实例失败：${message}`, 502);
  }

  return {
    instanceId: instance.id,
    personalCode,
    status: "PROVISIONING" as const,
  };
}

export async function listInstances(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new InstanceError("Workspace not found", 404);

  const instanceList = await db.query.instances.findMany({
    where: eq(instances.workspaceId, workspaceId),
    orderBy: [desc(instances.createdAt)],
  });

  // 获取所有相关的 cloudInstances
  const cloudInstanceIds = instanceList
    .map((i) => i.cloudInstanceId)
    .filter((id): id is string => id !== null);
  
  const cloudInstancesList = cloudInstanceIds.length
    ? await db.query.cloudInstances.findMany({
        where: (cloudInstances, { inArray }) => inArray(cloudInstances.id, cloudInstanceIds),
      })
    : [];
  
  const cloudInstanceMap = new Map(cloudInstancesList.map((ci) => [ci.id, ci]));

  return instanceList.map((instance) => ({
    ...instance,
    cloudInstanceName: instance.cloudInstanceId ? cloudInstanceMap.get(instance.cloudInstanceId)?.name ?? null : null,
    cloudInstanceType: instance.cloudInstanceId ? cloudInstanceMap.get(instance.cloudInstanceId)?.instanceType ?? null : null,
  }));
}

export async function getInstance(userId: string, instanceId: string) {
  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) throw new InstanceError("Instance not found", 404);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, instance.workspaceId),
  });
  if (!workspace) throw new InstanceError("Workspace not found", 404);

  if (workspace.userId !== userId) {
    throw new InstanceError("Instance not found", 404);
  }

  const cloudInstance = instance.cloudInstanceId
    ? await db.query.cloudInstances.findFirst({
        where: eq(cloudInstances.id, instance.cloudInstanceId),
      })
    : null;

  const logs = await db.query.instanceLogs.findMany({
    where: eq(instanceLogs.instanceId, instanceId),
    orderBy: [desc(instanceLogs.timestamp)],
    limit: 100,
  });

  return {
    ...instance,
    workspaceName: workspace.name,
    workspaceRegion: workspace.region,
    workspaceProvider: workspace.provider,
    workspaceActivityConfig: workspace.activityConfig,
    cloudInstanceName: cloudInstance?.name ?? null,
    cloudInstanceType: cloudInstance?.instanceType ?? null,
    logs,
  };
}

export async function stopInstance(userId: string, instanceId: string) {
  const instance = await db.query.instances.findFirst({
    where: eq(instances.id, instanceId),
  });
  if (!instance) throw new InstanceError("Instance not found", 404);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, instance.workspaceId),
  });
  if (!workspace) throw new InstanceError("Workspace not found", 404);

  if (workspace.userId !== userId) {
    throw new InstanceError("Instance not found", 404);
  }

  if (!["RUNNING", "BOOTING", "PROVISIONING"].includes(instance.status)) {
    throw new InstanceError("Instance is not running", 409);
  }

  // ① 先前置状态：请求返回后前端立刻能看到「释放中」，而不是一直等
  await db
    .update(instances)
    .set({
      status: "RELEASING",
      releaseRequestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(instances.id, instanceId));

  await db.insert(auditLogs).values({
    userId,
    workspaceId: instance.workspaceId,
    action: "INSTANCE_STOP",
    details: { instanceId, ecsInstanceId: instance.ecsInstanceId },
  });

  // ② 没有云资源（创建早期失败的行）→ 直接判定停止，无需等 hook
  if (!instance.ecsInstanceId) {
    await finalizeReleaseInline(instanceId);
    await cleanupExpiredLogs(instance.workspaceId);
    return { instanceId, status: "STOPPED", phase: "done" as const };
  }

  // ③ 下发 pre-stop（停止 hook）后立即返回。
  //    ⚠️ 绝不等脚本跑完（agent 执行回收脚本可能耗时，Vercel 免费版必然超时）。
  //    收尾由云函数 poll 的 advanceReleaseRow 负责，
  //    且必须 gate 在 agent 上报 ready-stop 之后才删 ECS —— 否则会丢用户未提交的代码。
  let hookDispatch: "ok" | "failed" = "ok";
  try {
    if (!instance.publicIp) {
      throw new Error("instance.publicIp is empty");
    }
    await dispatchPreStop({
      instanceId,
      workspaceId: instance.workspaceId,
      publicIp: instance.publicIp,
      accessToken: instance.accessToken ?? "",
      script: buildStopHook(),
      reason: "manual",
    });
    await db
      .update(instances)
      .set({ preStopDispatchedAt: new Date(), updatedAt: new Date() })
      .where(eq(instances.id, instanceId));
  } catch (e) {
    // 投递失败不阻塞请求：advanceReleaseRow 会在宽限期内重发，超时后强制释放
    hookDispatch = "failed";
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stopInstance] pre-stop dispatch failed:", message);
    await db
      .update(instances)
      .set({
        bootError: `pre-stop 下发失败，将自动重试：${message}`,
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instanceId));
  }

  // 触发云函数轮询跟踪（fire-and-forget；no-ecs 短路已 STOPPED，不入队）
  await enqueueTracking("release", instanceId, workspace.provider);

  return { instanceId, status: "RELEASING" as const, hookDispatch };
}

/** 无云资源时的就地收尾（不涉及 hook）。 */
async function finalizeReleaseInline(instanceId: string): Promise<void> {
  await db
    .update(instances)
    .set({
      status: "STOPPED",
      publicIp: null,
      port: null,
      accessToken: null,
      stopInvokeId: null,
      releaseRequestedAt: null,
      stoppedAt: new Date(),
      stopReason: "manual",
      logsExpireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(instances.id, instanceId));
}
