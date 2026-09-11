import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  workspaces,
  instances,
  auditLogs,
  settings,
  cloudInstances,
} from "@/lib/db/schema";
import { getUserSettings } from "@/lib/aliyun/auth";
import { getProvider } from "@/lib/providers";
import { ensureRegionResources } from "@/lib/ecs/provisioning";
import { buildUserData, buildStopHook, type EntrypointVars } from "@/lib/userdata";
import { resolveFeatures } from "@/lib/features";
import { getGitTokenEnc } from "@/lib/git/service";
import { encrypt } from "@/lib/crypto";

export const RAM_ROLE_NAME = "workspace-cloud-ecs-role";

export function getAppBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export function ossBucketForRegion(region: string): string {
  return `my-dev-workspace-${region}`;
}

export function generateAccessToken(): string {
  return randomBytes(16).toString("hex");
}

export interface CreateWorkspaceInput {
  name: string;
  provider: string;
  region: string;
  imageUri: string;
  diskCategory?: string;
  diskSize?: number;
  bandwidth?: number;
  publicIp?: boolean;
  features: { id: string; version: string; uri?: string }[];
  scripts?: { id: string; name: string; script: string }[];
  gitProvider?: string | null;
  gitRepoUrl?: string | null;
  gitBranch?: string;
  gitTokenEnc?: string | null;
  autoClone?: boolean;
  releaseHours?: number | null;
  idleMinutes?: number | null;
  proxyMode?: string | null;
  proxyClashSubscription?: string | null;
  proxyClashYaml?: string | null;
  proxyUpstreamUrl?: string | null;
  proxyUpstreamUsername?: string | null;
  proxyUpstreamSecret?: string | null;
}

interface LaunchIdentity {
  callbackUrl: string;
  accessToken: string;
  /** instances 行 id —— agent 的回调路径用它寻址 */
  instanceRowId: string;
}

async function launchInstance(
  workspace: typeof workspaces.$inferSelect,
  cloudInstance: typeof cloudInstances.$inferSelect,
  identity: LaunchIdentity,
): Promise<string> {
  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new Error(`Unknown provider: ${workspace.provider}`);
  }
  const creds = await provider.getCredentials(workspace.userId);
  const resources = await ensureRegionResources(creds, workspace.region);
  const s = await getUserSettings(workspace.userId);
  const releaseHours =
    workspace.releaseHours ?? s.defaultReleaseHours;

  // agent 用 instanceRowId 作为回调路径；token 与库中该行一致
  const entrypointVars: EntrypointVars = {
    instanceId: identity.instanceRowId,
    callbackUrl: identity.callbackUrl,
    accessToken: identity.accessToken,
    workspaceId: workspace.id,
    region: workspace.region,
    entry: workspace.entry ?? "",
    entryTimeoutSec: workspace.entryTimeout ?? 1800,
    idleMinutes: workspace.activityConfig?.idleMinutes ?? workspace.idleMinutes ?? 30,
    sampleIntervalSec: workspace.activityConfig?.sampleIntervalSec ?? 30,
    activityPorts: workspace.activityConfig?.ports ?? [],
  };
  const userData = buildUserData(entrypointVars);

  const autoReleaseTime = new Date(
    Date.now() + releaseHours * 3600 * 1000,
  ).toISOString().replace(/\.\d{3}Z$/, "Z");

  const instanceId = await provider.createInstance({
    region: workspace.region,
    imageId: resources.imageId,
    instanceType: cloudInstance.instanceType,
    securityGroupId: resources.securityGroupId,
    vSwitchId: resources.vSwitchId,
    ramRoleName: RAM_ROLE_NAME,
    diskCategory: "cloud_essd",
    diskSize: workspace.defaultDiskSize ?? 40,
    bandwidth: workspace.defaultBandwidth ?? 10,
    spotStrategy: "NoSpot",
    spotDuration: 1,
    spotPriceLimit: null,
    autoReleaseTime,
    userData,
    tags: { "workspace-id": workspace.id, "managed-by": "workspace-cloud" },
  });

  return instanceId;
}

/** Pre-launch validation: spot availability + balance sufficiency. */
async function preflightCheck(
  workspace: typeof workspaces.$inferSelect,
  cloudInstance: typeof cloudInstances.$inferSelect,
  releaseHours: number,
): Promise<void> {
  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new Error(`Unknown provider: ${workspace.provider}`);
  }

  try {
    const balance = await provider.getBalance();
    const imageId = await provider.findImage(workspace.region, "debian", "12");
    const details = await provider.describePrice({
      region: workspace.region,
      imageId,
      instanceType: cloudInstance.instanceType,
      spotStrategy: "NoSpot",
      spotDuration: 1,
      spotPriceLimit: null,
      diskCategory: "cloud_essd",
      diskSize: workspace.defaultDiskSize ?? 40,
      bandwidth: workspace.defaultBandwidth ?? 10,
    });
    const hourlyTotal = details.reduce((s, d) => s + (d.tradePrice ?? 0), 0);
    const estimated = hourlyTotal * releaseHours;
    if (balance.availableAmount < estimated) {
      throw new WorkspaceError(
        `余额不足：预计需 ¥${estimated.toFixed(2)}，当前可用 ¥${balance.availableAmount.toFixed(2)}`,
        409,
      );
    }
  } catch (e) {
    if (e instanceof WorkspaceError) throw e;
    console.warn("[preflight] balance check skipped:", e);
  }
}

/** Ensure an ACR enterprise instance exists for the region (best-effort). */
async function ensureAcrInstance(
  providerName: string,
  region: string,
): Promise<string | null> {
  try {
    const provider = getProvider(providerName);
    if (!provider) {
      console.warn(`[acr] unknown provider ${providerName}`);
      return null;
    }
    const instances = await provider.listRegistryInstances(region);
    const existing = instances.find(
      (i) => i.status === "Running" || i.status === "ACTIVE",
    );
    if (existing) return existing.id;
    return null;
  } catch (e) {
    console.warn("[acr] ensure instance skipped:", e);
    return null;
  }
}

export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
) {
  const features = resolveFeatures(input.features ?? []);

  let gitTokenEnc = input.gitTokenEnc ?? null;
  if (!gitTokenEnc && input.gitProvider && input.gitRepoUrl) {
    gitTokenEnc = await getGitTokenEnc(userId, input.gitProvider);
  }

  let proxyUpstreamSecret = input.proxyUpstreamSecret || null;
  if (proxyUpstreamSecret) {
    proxyUpstreamSecret = encrypt(proxyUpstreamSecret);
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId,
      name: input.name,
      provider: input.provider,
      region: input.region,
      imageUri: input.imageUri,
      defaultDiskSize: input.diskSize,
      defaultBandwidth: input.bandwidth,
      publicIp: input.publicIp,
      features,
      gitProvider: input.gitProvider ?? null,
      gitRepoUrl: input.gitRepoUrl ?? null,
      gitBranch: input.gitBranch ?? "main",
      gitTokenEnc,
      autoClone: input.autoClone ?? true,
      releaseHours: input.releaseHours ?? null,
      idleMinutes: input.idleMinutes ?? null,
      ossWorkspacePath: null,
      proxyMode:
        input.proxyMode === undefined || input.proxyMode === ""
          ? "inherit"
          : input.proxyMode,
      proxyClashSubscription: input.proxyClashSubscription || null,
      proxyClashYaml: input.proxyClashYaml || null,
      proxyUpstreamUrl: input.proxyUpstreamUrl || null,
      proxyUpstreamUsername: input.proxyUpstreamUsername || null,
      proxyUpstreamSecret: input.proxyUpstreamSecret ? proxyUpstreamSecret : null,
    })
    .returning();

  const ossWorkspacePath = `ws-${workspace.id}/workspace`;
  await db
    .update(workspaces)
    .set({ ossWorkspacePath })
    .where(eq(workspaces.id, workspace.id));

  await db.insert(auditLogs).values({
    userId,
    workspaceId: workspace.id,
    action: "CREATE",
    details: { name: input.name, provider: input.provider, region: input.region },
  });

  const provider = getProvider(input.provider);
  if (!provider) {
    throw new Error(`Unknown provider: ${input.provider}`);
  }
  await provider.ensureStorage(input.region, ossBucketForRegion(input.region));

  const updatedWorkspace = { ...workspace, ossWorkspacePath };

  // Ensure an ACR instance exists when the image is hosted on ACR.
  if ((updatedWorkspace.imageUri ?? "").match(/registry\..*\.aliyuncs\.com\//)) {
    const acrId = await ensureAcrInstance(updatedWorkspace.provider, updatedWorkspace.region);
    if (acrId) {
      await db
        .update(settings)
        .set({ acrInstanceId: acrId, updatedAt: new Date() })
        .where(eq(settings.userId, userId));
    }
  }

  return { workspaceId: workspace.id };
}

export interface StartWorkspaceInput {
  mode: "quick" | "custom";
  cloudInstanceId: string;
  diskCategory?: string;
  diskSize?: number;
  bandwidth?: number;
}

/**
 * 启动实例。
 *
 * 顺序很重要（docs/FINAL-PLAN.md §9）：**先建 instances 行拿到 id + accessToken，
 * 再把这些值渲染进 entrypoint**。否则 agent 配置里的 token 与库里的不一致，
 * agent 永远无法通过鉴权。
 */
export async function startWorkspace(
  userId: string,
  workspaceId: string,
  input: StartWorkspaceInput,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  if (!input.cloudInstanceId) {
    throw new WorkspaceError("请先选择弹性规格", 400);
  }

  // Load cloud instance to get instanceType
  const cloudInstance = await db.query.cloudInstances.findFirst({
    where: eq(cloudInstances.id, input.cloudInstanceId),
  });
  if (!cloudInstance) throw new WorkspaceError("Cloud instance not found", 404);

  // Update workspace settings if custom mode
  if (input.mode === "custom") {
    const patch: Partial<typeof workspaces.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.diskSize) patch.defaultDiskSize = input.diskSize;
    if (input.bandwidth) patch.defaultBandwidth = input.bandwidth;
    await db.update(workspaces).set(patch).where(eq(workspaces.id, workspaceId));
    if (input.diskSize) workspace.defaultDiskSize = input.diskSize;
    if (input.bandwidth) workspace.defaultBandwidth = input.bandwidth;
  }

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "START",
    details: { mode: input.mode, instanceType: cloudInstance.instanceType },
  });

  const s = await getUserSettings(userId);
  const releaseHours = workspace.releaseHours ?? s.defaultReleaseHours;

  // ① 先建行：拿到 instance row id 与 accessToken
  const [instanceRow] = await db
    .insert(instances)
    .values({
      workspaceId,
      cloudInstanceId: input.cloudInstanceId,
      diskSize: workspace.defaultDiskSize ?? 40,
      bandwidth: workspace.defaultBandwidth ?? 10,
      status: "PROVISIONING",
      accessToken: generateAccessToken(),
      bootStartedAt: new Date(),
      currentEntry: workspace.entry ?? null,
    })
    .returning();

  try {
    await preflightCheck(workspace, cloudInstance, releaseHours);

    // ② 用该行渲染 entrypoint 并创建 ECS 实例
    const ecsInstanceId = await launchInstance(workspace, cloudInstance, {
      callbackUrl: getAppBaseUrl(),
      accessToken: instanceRow.accessToken ?? "",
      instanceRowId: instanceRow.id,
    });

    await db
      .update(instances)
      .set({ ecsInstanceId, updatedAt: new Date() })
      .where(eq(instances.id, instanceRow.id));

    return { workspaceId, instanceId: ecsInstanceId, instanceRowId: instanceRow.id };
  } catch (e) {
    // 启动失败：把刚建的行标记为 FAILED，避免留下悬挂的 PROVISIONING
    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: e instanceof Error ? e.message : String(e),
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instanceRow.id));
    throw e;
  }
}

export async function stopWorkspace(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  // 查找该工作区最新的 RUNNING 实例
  const instance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "RUNNING"),
    ),
  });
  if (!instance?.ecsInstanceId) {
    throw new WorkspaceError("Workspace is not running", 409);
  }

  await db
    .update(instances)
    .set({ status: "TERMINATING", updatedAt: new Date() })
    .where(eq(instances.id, instance.id));

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "STOP",
    details: { instanceId: instance.ecsInstanceId },
  });

  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new WorkspaceError("Unknown provider", 500);
  }
  const region = workspace.region;
  let ossUsageBytes: number | null = null;

  try {
    const { invokeId } = await provider.runCommand(instance.ecsInstanceId, region, buildStopHook());

    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const result = await provider.getCommandResult(invokeId, region);
      if (result.status === "Finished" || result.status === "Failed") {
        const match = result.output.match(/OSS_USAGE=(\d+)/);
        if (match) ossUsageBytes = Number(match[1]);
        break;
      }
    }
  } catch (e) {
    console.error("stop-hook failed, force deleting", e);
  }

  await provider.deleteInstance(instance.ecsInstanceId, region);

  await db
    .update(instances)
    .set({
      status: "STOPPED",
      publicIp: null,
      port: null,
      accessToken: null,
      ossUsageBytes: ossUsageBytes ?? undefined,
      stoppedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(instances.id, instance.id));

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "TERMINATE",
    details: { instanceId: instance.ecsInstanceId, ossUsageBytes },
  });

  return { workspaceId, ossUsageBytes };
}

/**
 * 空闲释放的「快速路径」：不跑 stop-hook，直接删 ECS。
 * 用于 maintenance 的 idle 任务，避免 serverless 函数超时（stop-hook 最长 120s）。
 */
export async function releaseIdleWorkspace(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  const instance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "RUNNING"),
    ),
  });
  if (!instance?.ecsInstanceId) {
    throw new WorkspaceError("Workspace is not running", 409);
  }

  await db
    .update(instances)
    .set({ status: "TERMINATING", updatedAt: new Date() })
    .where(eq(instances.id, instance.id));

  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new WorkspaceError("Unknown provider", 500);
  }

  try {
    await provider.deleteInstance(instance.ecsInstanceId, workspace.region);
  } catch (e) {
    console.error("[releaseIdleWorkspace] delete instance failed:", e);
    await db
      .update(instances)
      .set({ status: "FAILED", bootError: "空闲释放失败：云资源删除失败", updatedAt: new Date() })
      .where(eq(instances.id, instance.id));
    throw e;
  }

  await db
    .update(instances)
    .set({
      status: "STOPPED",
      publicIp: null,
      port: null,
      accessToken: null,
      stoppedAt: new Date(),
      stopReason: "idle_release",
      updatedAt: new Date(),
    })
    .where(eq(instances.id, instance.id));

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "IDLE_RELEASE",
    details: { instanceId: instance.ecsInstanceId },
  });

  return { workspaceId };
}

export async function deleteWorkspace(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  // 查找该工作区的所有实例
  const workspaceInstances = await db.query.instances.findMany({
    where: eq(instances.workspaceId, workspaceId),
  });

  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new WorkspaceError("Unknown provider", 500);
  }

  // 删除所有有 ecsInstanceId 的实例
  for (const inst of workspaceInstances) {
    if (inst.ecsInstanceId) {
      try {
        await provider.deleteInstance(inst.ecsInstanceId, workspace.region);
      } catch (e) {
        console.error("delete instance failed", e);
      }
    }
  }

  try {
    await provider.deleteStoragePrefix(
      workspace.region,
      ossBucketForRegion(workspace.region),
      `ws-${workspaceId}/`,
    );
  } catch (e) {
    console.error("delete OSS prefix failed", e);
  }

  // 删除实例记录
  await db
    .delete(instances)
    .where(eq(instances.workspaceId, workspaceId));
  
  // 删除工作区
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

  await db.insert(auditLogs).values({
    userId,
    workspaceId: null,
    action: "DELETE",
    details: { workspaceId },
  });

  return { workspaceId };
}

export async function renewWorkspace(
  userId: string,
  workspaceId: string,
  hours: number,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  // 查找该工作区最新的 RUNNING 实例
  const instance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "RUNNING"),
    ),
  });
  if (!instance?.ecsInstanceId) {
    throw new WorkspaceError("Workspace is not running", 409);
  }

  const provider = getProvider(workspace.provider);
  if (!provider) {
    throw new WorkspaceError("Unknown provider", 500);
  }
  const autoReleaseTime = new Date(
    Date.now() + hours * 3600 * 1000,
  ).toISOString();
  await provider.setAutoReleaseTime(instance.ecsInstanceId, workspace.region, autoReleaseTime);

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "RENEW",
    details: { hours, instanceId: instance.ecsInstanceId },
  });

  return { workspaceId, autoReleaseTime };
}

export class WorkspaceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WorkspaceError";
    this.status = status;
  }
}
