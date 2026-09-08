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
import { getUserSettings, getUserCredentials } from "@/lib/aliyun/auth";
import {
  runInstances,
  deleteInstance,
  runCommand,
  describeInvocationResults,
} from "@/lib/aliyun/ecs";
import { ensureRegionResources } from "@/lib/ecs/provisioning";
import {
  buildUserData,
  buildStopHook,
  type EntrypointVars,
} from "@/lib/userdata";
import { resolveFeatures } from "@/lib/features";
import { buildAuthUrl } from "@/lib/git/auth-url";
import { getGitTokenEnc } from "@/lib/git/service";
import { decryptGitToken } from "@/lib/userdata";
import { getAppBaseUrl, RAM_ROLE_NAME } from "@/lib/workspaces/service";

export class InstanceError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = "InstanceError";
  }
}

function generateBootToken(): string {
  return randomBytes(16).toString("hex");
}

function generateAccessCode(): string {
  return `inst_${randomBytes(12).toString("hex")}`;
}

export interface CreateInstanceInput {
  diskSize?: number;
  bandwidth?: number;
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

  const provisioningInstance = await db.query.instances.findFirst({
    where: and(
      eq(instances.workspaceId, workspaceId),
      eq(instances.status, "PROVISIONING"),
    ),
  });
  if (provisioningInstance) {
    throw new InstanceError("Workspace already has a provisioning instance", 409);
  }

  const cloudInstance = await db.query.cloudInstances.findFirst({
    where: eq(cloudInstances.id, workspace.cloudInstanceId),
  });
  if (!cloudInstance) throw new InstanceError("Cloud instance not found", 404);

  const diskSize = input.diskSize ?? workspace.defaultDiskSize ?? 40;
  const bandwidth = input.bandwidth ?? workspace.defaultBandwidth ?? 10;

  const [instance] = await db
    .insert(instances)
    .values({
      workspaceId,
      diskSize,
      bandwidth,
      status: "PROVISIONING",
      bootToken: generateBootToken(),
      bootStartedAt: new Date(),
    })
    .returning();

  const personalCode = generateAccessCode();
  await db.insert(instanceAccessCodes).values({
    instanceId: instance.id,
    code: personalCode,
    isPersonal: true,
    allowedPorts: [8080],
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
    const creds = await getUserCredentials(userId);
    const resources = await ensureRegionResources(creds, workspace.region);

    const gitTokenEnc = workspace.gitTokenEnc
      ? workspace.gitTokenEnc
      : workspace.gitProvider
        ? await getGitTokenEnc(userId, workspace.gitProvider)
        : null;

    const gitAuthedUrl = gitTokenEnc
      ? buildAuthUrl(
          workspace.gitProvider!,
          workspace.gitRepoUrl!,
          decryptGitToken(gitTokenEnc)!,
        )
      : undefined;

    const resolvedFeatures = workspace.features?.length
      ? resolveFeatures(
          workspace.features.map((f) => ({ id: f.id, version: f.version })),
        )
      : [];

    const callbackUrl = getAppBaseUrl();
    const entrypointVars: EntrypointVars = {
      instanceId: instance.id,
      workspaceId: workspace.id,
      ossBucket: `my-dev-workspace-${workspace.region}`,
      ossWorkspacePath: workspace.ossWorkspacePath ?? `ws-${workspace.id}/workspace`,
      region: workspace.region,
      imageUri: workspace.imageUri,
      ramRoleName: RAM_ROLE_NAME,
      callbackUrl,
      accessToken: instance.bootToken!,
      gitRepoUrl: workspace.gitRepoUrl,
      gitBranch: workspace.gitBranch ?? "main",
      gitAuthedUrl,
      gitAutoClone: workspace.autoClone ?? true,
      idleMinutes: workspace.idleMinutes ?? s.defaultIdleMinutes ?? 30,
      features: resolvedFeatures,
    };

    const userData = buildUserData(entrypointVars);
    const autoReleaseTime = new Date(
      Date.now() + releaseHours * 3600 * 1000,
    ).toISOString().replace(/\.\d{3}Z$/, "Z");

    const ecsInstanceId = await runInstances(creds, {
      region: workspace.region,
      imageId: resources.imageId,
      instanceType: cloudInstance.instanceType,
      securityGroupId: resources.securityGroupId,
      vSwitchId: resources.vSwitchId,
      ramRoleName: RAM_ROLE_NAME,
      diskCategory: "cloud_essd",
      diskSize: instance.diskSize,
      bandwidth: instance.bandwidth,
      spotStrategy: "NoSpot",
      spotDuration: 1,
      spotPriceLimit: null,
      autoReleaseTime,
      userData,
      tags: { "instance-id": instance.id, "managed-by": "workspace-cloud" },
    });

    await db
      .update(instances)
      .set({ ecsInstanceId: ecsInstanceId.instanceId })
      .where(eq(instances.id, instance.id));

    return { instanceId: instance.id, ecsInstanceId, personalCode };
  } catch (e) {
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

  const instanceList = await db.query.instances.findMany({
    where: eq(instances.workspaceId, workspaceId),
    orderBy: [desc(instances.createdAt)],
  });

  return instanceList;
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

  const cloudInstance = await db.query.cloudInstances.findFirst({
    where: eq(cloudInstances.id, workspace.cloudInstanceId),
  });

  const logs = await db.query.instanceLogs.findMany({
    where: eq(instanceLogs.instanceId, instanceId),
    orderBy: [desc(instanceLogs.timestamp)],
    limit: 100,
  });

  return {
    ...instance,
    workspaceName: workspace.name,
    cloudInstanceName: cloudInstance?.name,
    cloudInstanceType: cloudInstance?.instanceType,
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
      const creds = await getUserCredentials(userId);
      const hookScript = buildStopHook();
      const commandResult = await runCommand(
        creds,
        workspace.region,
        instance.ecsInstanceId,
        hookScript,
      );

      let ossUsageBytes: number | null = null;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const results = await describeInvocationResults(
          creds,
          workspace.region,
          commandResult.invokeId,
        );
        const output = results.output ?? "";
        const match = output.match(/OSS_USAGE=(\d+)/);
        if (match) {
          ossUsageBytes = parseInt(match[1], 10);
          break;
        }
      }

      await deleteInstance(creds, workspace.region, instance.ecsInstanceId);

      await db
        .update(instances)
        .set({
          status: "STOPPED",
          stoppedAt: new Date(),
          stopReason: "manual",
          ossUsageBytes,
          logsExpireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
