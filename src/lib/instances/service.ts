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
import { getUserSettings } from "@/lib/aliyun/auth";
import { getProvider } from "@/lib/providers";
import { ensureRegionResources, ensureInstanceSecurityGroup } from "@/lib/ecs/provisioning";
import {
  buildUserData,
  buildStopHook,
  type EntrypointVars,
} from "@/lib/userdata";
import { getAppBaseUrl, RAM_ROLE_NAME } from "@/lib/workspaces/service";
import { ALL_PORTS } from "@/lib/constants";
import { checkAndFixTimeouts } from "./lifecycle";

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

  // 检查并修复超时实例
  await checkAndFixTimeouts(userId, workspaceId);

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

  const s = await getUserSettings(userId);
  const releaseHours = workspace.releaseHours ?? s.defaultReleaseHours;

  try {
    console.log("[createInstance] Getting provider credentials...");
    const provider = getProvider(workspace.provider);
    if (!provider) {
      throw new InstanceError("Unknown provider", 500);
    }
    const creds = await provider.getCredentials(userId);
    console.log("[createInstance] Credentials OK, ensuring region resources...");
    const resources = await ensureRegionResources(creds, workspace.region);
    console.log("[createInstance] Region resources OK, building user data...");
    const instanceSgId = await ensureInstanceSecurityGroup(
      creds,
      workspace.region,
      resources.vpcId,
      instance.id,
    );

    const callbackUrl = getAppBaseUrl();
    const entrypointVars: EntrypointVars = {
      instanceId: instance.id,
      callbackUrl,
      accessToken: instance.accessToken!,
    };

    const userData = buildUserData(entrypointVars);
    const autoReleaseTime = new Date(
      Date.now() + releaseHours * 3600 * 1000,
    ).toISOString().replace(/\.\d{3}Z$/, "Z");

    console.log("[createInstance] Creating ECS instance via Aliyun API...");
    const ecsInstanceId = await provider.createInstance({
      region: workspace.region,
      imageId: resources.imageId,
      instanceType: cloudInstance.instanceType,
      securityGroupId: instanceSgId,
      vSwitchId: resources.vSwitchId,
      ramRoleName: RAM_ROLE_NAME,
      diskCategory: "cloud_essd",
      diskSize: instance.diskSize,
      bandwidth: instance.bandwidth,
      spotStrategy: input.spotStrategy ?? "NoSpot",
      spotDuration: input.spotDuration ?? 1,
      spotPriceLimit: input.spotPriceLimit ?? null,
      autoReleaseTime,
      userData,
      tags: { "instance-id": instance.id, "managed-by": "workspace-cloud" },
    });
    console.log("[createInstance] ECS instance created:", ecsInstanceId);

    await db
      .update(instances)
      .set({ ecsInstanceId, securityGroupId: instanceSgId })
      .where(eq(instances.id, instance.id));

    return { instanceId: instance.id, ecsInstanceId, personalCode };
  } catch (e) {
    console.error("[createInstance] Error:", e);
    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: e instanceof Error ? e.message : String(e),
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instance.id));
    throw e;
  }
}

export async function listInstances(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new InstanceError("Workspace not found", 404);

  // 查询前检查超时实例
  await checkAndFixTimeouts(userId, workspaceId);

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

  // 修正超时实例后再返回状态，确保展示准确
  await checkAndFixTimeouts(userId, instance.workspaceId);

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

  await db
    .update(instances)
    .set({ status: "RELEASING" })
    .where(eq(instances.id, instanceId));

  await db.insert(auditLogs).values({
    userId,
    workspaceId: instance.workspaceId,
    action: "INSTANCE_STOP",
    details: { instanceId, ecsInstanceId: instance.ecsInstanceId },
  });

  if (instance.ecsInstanceId) {
    try {
      const provider = getProvider(workspace.provider);
      if (!provider) {
        throw new InstanceError("Unknown provider", 500);
      }
      const region = workspace.region;
      const hookScript = buildStopHook();
      const commandResult = await provider.runCommand(
        instance.ecsInstanceId,
        region,
        hookScript,
      );

      let ossUsageBytes: number | null = null;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const results = await provider.getCommandResult(commandResult.invokeId, region);
        const output = results.output ?? "";
        const match = output.match(/OSS_USAGE=(\d+)/);
        if (match) {
          ossUsageBytes = parseInt(match[1], 10);
          break;
        }
      }

      await provider.deleteInstance(instance.ecsInstanceId, region);

      await db
        .update(instances)
        .set({
          status: "STOPPED",
          stoppedAt: new Date(),
          stopReason: "manual",
          ossUsageBytes,
          logsExpireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(instances.id, instanceId));
    } catch (e) {
      await db
        .update(instances)
        .set({
          status: "FAILED",
          bootError: `Stop failed: ${e instanceof Error ? e.message : String(e)}`,
          updatedAt: new Date(),
        })
        .where(eq(instances.id, instanceId));
    }
  } else {
    await db
      .update(instances)
      .set({
        status: "STOPPED",
        stoppedAt: new Date(),
        stopReason: "manual",
        logsExpireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .where(eq(instances.id, instanceId));
  }

  await cleanupExpiredLogs(instance.workspaceId);

  return { instanceId, status: "STOPPED" };
}

async function cleanupExpiredLogs(workspaceId: string): Promise<void> {
  try {
    const expiredInstances = await db.query.instances.findMany({
      where: and(
        eq(instances.workspaceId, workspaceId),
        eq(instances.status, "STOPPED"),
      ),
    });

    const now = new Date();
    for (const inst of expiredInstances) {
      if (inst.logsExpireAt && new Date(inst.logsExpireAt) < now) {
        await db
          .delete(instanceLogs)
          .where(eq(instanceLogs.instanceId, inst.id));
      }
    }
  } catch (e) {
    console.error("[instances] Failed to cleanup expired logs:", e);
  }
}
