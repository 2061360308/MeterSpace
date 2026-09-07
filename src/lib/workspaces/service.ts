import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  workspaces,
  workspaceStates,
  auditLogs,
  settings,
} from "@/lib/db/schema";
import { getUserSettings } from "@/lib/aliyun/auth";
import { getUserCredentials } from "@/lib/aliyun/auth";
import {
  runInstances,
  deleteInstance,
  runCommand,
  describeInvocationResults,
  modifyInstanceAutoReleaseTime,
  describeSpotAdvice,
  describePrice,
  findDebianImage,
} from "@/lib/aliyun/ecs";
import { queryAccountBalance } from "@/lib/aliyun/bss";
import { ensureRegionResources } from "@/lib/ecs/provisioning";
import { ensureBucket } from "@/lib/aliyun/oss";
import {
  buildUserData,
  buildStopHook,
  type EntrypointVars,
} from "@/lib/userdata";
import { resolveFeatures } from "@/lib/features";
import { buildAuthUrl } from "@/lib/git/auth-url";
import { getGitTokenEnc } from "@/lib/git/service";
import { decryptGitToken } from "@/lib/userdata";

export const RAM_ROLE_NAME = "workspace-cloud-ecs-role";

export function getAppBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

export function ossBucketForRegion(region: string): string {
  return `my-dev-workspace-${region}`;
}

export function generateAccessToken(): string {
  return randomBytes(16).toString("hex");
}

export interface CreateWorkspaceInput {
  name: string;
  region: string;
  instanceType: string;
  diskCategory: string;
  diskSize: number;
  bandwidth: number;
  publicIp: boolean;
  spotStrategy: string;
  spotDuration: number;
  spotPriceLimit?: number | null;
  imageUri: string;
  features: { id: string; version: string }[];
  gitProvider?: string | null;
  gitRepoUrl?: string | null;
  gitBranch?: string;
  gitTokenEnc?: string | null;
  autoClone?: boolean;
  releaseHours?: number | null;
  idleMinutes?: number | null;
}

async function buildEntrypointVars(
  workspace: typeof workspaces.$inferSelect,
  accessToken: string,
): Promise<EntrypointVars> {
  const s = await getUserSettings(workspace.userId);
  const bucket = ossBucketForRegion(workspace.region);
  const gitToken = decryptGitToken(workspace.gitTokenEnc);
  const gitAuthedUrl =
    workspace.gitRepoUrl && gitToken && workspace.gitProvider
      ? buildAuthUrl(workspace.gitProvider, workspace.gitRepoUrl, gitToken)
      : null;

  return {
    workspaceId: workspace.id,
    ossBucket: bucket,
    ossWorkspacePath: workspace.ossWorkspacePath ?? `ws-${workspace.id}/workspace`,
    region: workspace.region,
    imageUri: workspace.imageUri,
    ramRoleName: RAM_ROLE_NAME,
    callbackUrl: getAppBaseUrl(),
    accessToken,
    gitRepoUrl: workspace.gitRepoUrl,
    gitBranch: workspace.gitBranch ?? "main",
    gitAuthedUrl,
    gitAutoClone: workspace.autoClone ?? true,
    idleMinutes:
      workspace.idleMinutes ?? s.defaultIdleMinutes,
    features: workspace.features ?? [],
  };
}

async function launchInstance(
  workspace: typeof workspaces.$inferSelect,
  accessToken: string,
): Promise<string> {
  const creds = await getUserCredentials(workspace.userId);
  const s = await getUserSettings(workspace.userId);
  const resources = await ensureRegionResources(creds, workspace.region);
  const releaseHours =
    workspace.releaseHours ?? s.defaultReleaseHours;

  const userData = buildUserData(
    await buildEntrypointVars(workspace, accessToken),
  );

  const autoReleaseTime = new Date(
    Date.now() + releaseHours * 3600 * 1000,
  ).toISOString().replace(/\.\d{3}Z$/, "Z");

  const { instanceId } = await runInstances(creds, {
    region: workspace.region,
    imageId: resources.imageId,
    instanceType: workspace.instanceType,
    securityGroupId: resources.securityGroupId,
    vSwitchId: resources.vSwitchId,
    ramRoleName: RAM_ROLE_NAME,
    diskCategory: workspace.diskCategory ?? "cloud_essd",
    diskSize: workspace.diskSize ?? 40,
    bandwidth: workspace.bandwidth ?? 10,
    spotStrategy: workspace.spotStrategy ?? "NoSpot",
    spotDuration: workspace.spotDuration ?? 1,
    spotPriceLimit: workspace.spotPriceLimit
      ? Number(workspace.spotPriceLimit)
      : null,
    autoReleaseTime,
    userData,
    tags: { "workspace-id": workspace.id, "managed-by": "workspace-cloud" },
  });

  return instanceId;
}

/** Pre-launch validation: spot availability + balance sufficiency. */
async function preflightCheck(
  workspace: typeof workspaces.$inferSelect,
  releaseHours: number,
): Promise<void> {
  const creds = await getUserCredentials(workspace.userId);

  if ((workspace.spotStrategy ?? "NoSpot") !== "NoSpot") {
    const advice = await describeSpotAdvice(
      creds,
      workspace.region,
      workspace.instanceType,
      workspace.spotDuration ?? 1,
    );
    if (!advice.available) {
      throw new WorkspaceError(
        "该规格当前无可用抢占实例，请改用按量付费或更换规格/地域",
        409,
      );
    }
    
    // 检查手动出价是否合理
    if (workspace.spotStrategy === "SpotWithPriceLimit" && workspace.spotPriceLimit) {
      const imageId = await findDebianImage(creds, workspace.region);
      const details = await describePrice(creds, {
        region: workspace.region,
        imageId,
        instanceType: workspace.instanceType,
        spotStrategy: "SpotAsPriceGo",
        spotDuration: workspace.spotDuration ?? 1,
        diskCategory: workspace.diskCategory ?? "cloud_essd",
        diskSize: workspace.diskSize ?? 40,
        bandwidth: workspace.bandwidth ?? 10,
      });
      const instanceDetail = details.find(d => d.resource === "instanceType");
      const currentSpotPrice = instanceDetail?.tradePrice ?? 0;
      
      if (Number(workspace.spotPriceLimit) < currentSpotPrice) {
        throw new WorkspaceError(
          `出价过低：当前市场价格为 ¥${currentSpotPrice.toFixed(4)}/时，您的出价 ¥${Number(workspace.spotPriceLimit).toFixed(4)}/时 低于市场价。建议提高出价或改用自动出价`,
          409,
        );
      }
    }
  }

  try {
    const balance = await queryAccountBalance(creds);
    const imageId = await findDebianImage(creds, workspace.region);
    const details = await describePrice(creds, {
      region: workspace.region,
      imageId,
      instanceType: workspace.instanceType,
      spotStrategy: workspace.spotStrategy ?? "NoSpot",
      spotDuration: workspace.spotDuration ?? 1,
      spotPriceLimit: workspace.spotPriceLimit
        ? Number(workspace.spotPriceLimit)
        : null,
      diskCategory: workspace.diskCategory ?? "cloud_essd",
      diskSize: workspace.diskSize ?? 40,
      bandwidth: workspace.bandwidth ?? 10,
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
  userId: string,
  region: string,
): Promise<string | null> {
  try {
    const creds = await getUserCredentials(userId);
    const { listInstances, createInstance } = await import("@/lib/aliyun/acr");
    const instances = await listInstances(creds, region);
    const existing = instances.find(
      (i) => i.status === "Running" || i.status === "ACTIVE",
    );
    if (existing) return existing.instanceId;
    return await createInstance(creds, region, "workspace-cloud");
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

  // Resolve the git token from the stored provider OAuth token if not provided.
  let gitTokenEnc = input.gitTokenEnc ?? null;
  if (!gitTokenEnc && input.gitProvider && input.gitRepoUrl) {
    gitTokenEnc = await getGitTokenEnc(userId, input.gitProvider);
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId,
      name: input.name,
      region: input.region,
      instanceType: input.instanceType,
      diskCategory: input.diskCategory,
      diskSize: input.diskSize,
      bandwidth: input.bandwidth,
      publicIp: input.publicIp,
      spotStrategy: input.spotStrategy,
      spotDuration: input.spotDuration,
      spotPriceLimit: input.spotPriceLimit
        ? String(input.spotPriceLimit)
        : null,
      imageUri: input.imageUri,
      features,
      gitProvider: input.gitProvider ?? null,
      gitRepoUrl: input.gitRepoUrl ?? null,
      gitBranch: input.gitBranch ?? "main",
      gitTokenEnc,
      autoClone: input.autoClone ?? true,
      releaseHours: input.releaseHours ?? null,
      idleMinutes: input.idleMinutes ?? null,
      ossWorkspacePath: null, // filled below after id is known
    })
    .returning();

  const ossWorkspacePath = `ws-${workspace.id}/workspace`;
  await db
    .update(workspaces)
    .set({ ossWorkspacePath })
    .where(eq(workspaces.id, workspace.id));

  const accessToken = generateAccessToken();

  await db.insert(workspaceStates).values({
    workspaceId: workspace.id,
    status: "STOPPED",
    accessToken,
  });

  await db.insert(auditLogs).values({
    userId,
    workspaceId: workspace.id,
    action: "CREATE",
    details: { name: input.name, instanceType: input.instanceType },
  });

  // Ensure OSS bucket exists (per region).
  const creds = await getUserCredentials(userId);
  await ensureBucket(creds, input.region, ossBucketForRegion(input.region));

  const updatedWorkspace = { ...workspace, ossWorkspacePath };

  // Ensure an ACR instance exists when the image is hosted on ACR.
  if (updatedWorkspace.imageUri.match(/registry\..*\.aliyuncs\.com\//)) {
    const acrId = await ensureAcrInstance(userId, updatedWorkspace.region);
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
  instanceType?: string;
  spotStrategy?: string;
  spotDuration?: number;
  spotPriceLimit?: number | null;
  diskCategory?: string;
  diskSize?: number;
  bandwidth?: number;
}

export async function startWorkspace(
  userId: string,
  workspaceId: string,
  input: StartWorkspaceInput,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  if (input.mode === "custom") {
    const patch: Partial<typeof workspaces.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.instanceType) patch.instanceType = input.instanceType;
    if (input.spotStrategy) patch.spotStrategy = input.spotStrategy;
    if (input.spotDuration !== undefined)
      patch.spotDuration = input.spotDuration;
    if (input.spotPriceLimit !== undefined)
      patch.spotPriceLimit = input.spotPriceLimit
        ? String(input.spotPriceLimit)
        : null;
    if (input.diskCategory) patch.diskCategory = input.diskCategory;
    if (input.diskSize) patch.diskSize = input.diskSize;
    if (input.bandwidth) patch.bandwidth = input.bandwidth;
    await db.update(workspaces).set(patch).where(eq(workspaces.id, workspaceId));
    workspace.instanceType = input.instanceType ?? workspace.instanceType;
    workspace.spotStrategy = input.spotStrategy ?? workspace.spotStrategy;
    workspace.diskCategory = input.diskCategory ?? workspace.diskCategory;
    workspace.diskSize = input.diskSize ?? workspace.diskSize;
    workspace.bandwidth = input.bandwidth ?? workspace.bandwidth;
  }

  const accessToken = generateAccessToken();
  await db
    .update(workspaceStates)
    .set({ status: "PROVISIONING", accessToken, healthCallback: false })
    .where(eq(workspaceStates.workspaceId, workspaceId));

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "START",
    details: { mode: input.mode, instanceType: workspace.instanceType },
  });

  // Pre-launch validation + launch with FAILED rollback on error.
  const s = await getUserSettings(userId);
  const releaseHours = workspace.releaseHours ?? s.defaultReleaseHours;
  try {
    await preflightCheck(workspace, releaseHours);
    const instanceId = await launchInstance(workspace, accessToken);
    await db
      .update(workspaceStates)
      .set({ instanceId, status: "PROVISIONING" })
      .where(eq(workspaceStates.workspaceId, workspaceId));
    return { workspaceId, instanceId };
  } catch (e) {
    await db
      .update(workspaceStates)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(workspaceStates.workspaceId, workspaceId));
    throw e;
  }
}

export async function stopWorkspace(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  const state = await db.query.workspaceStates.findFirst({
    where: eq(workspaceStates.workspaceId, workspaceId),
  });
  const instanceId = state?.instanceId;
  if (!instanceId) {
    throw new WorkspaceError("Workspace is not running", 409);
  }

  await db
    .update(workspaceStates)
    .set({ status: "TERMINATING" })
    .where(eq(workspaceStates.workspaceId, workspaceId));

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "STOP",
    details: { instanceId },
  });

  const creds = await getUserCredentials(userId);
  let ossUsageBytes: number | null = null;

  try {
    // 1. Run stop-hook inside the instance via Cloud Assistant.
    const { invokeId } = await runCommand(
      creds,
      workspace.region,
      instanceId,
      buildStopHook(),
    );

    // 2. Poll for completion.
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const result = await describeInvocationResults(
        creds,
        workspace.region,
        invokeId,
      );
      if (result.status === "Finished" || result.status === "Failed") {
        const match = result.output.match(/OSS_USAGE=(\d+)/);
        if (match) ossUsageBytes = Number(match[1]);
        break;
      }
    }
  } catch (e) {
    // Cleanup failed — proceed to force delete; data is already on OSS + git remote.
    console.error("stop-hook failed, force deleting", e);
  }

  // 3. Delete instance.
  await deleteInstance(creds, workspace.region, instanceId);

  await db
    .update(workspaceStates)
    .set({
      status: "STOPPED",
      instanceId: null,
      publicIp: null,
      port: null,
      accessToken: null,
      healthCallback: false,
      ossUsageBytes: ossUsageBytes ?? undefined,
      releasedAt: new Date(),
    })
    .where(eq(workspaceStates.workspaceId, workspaceId));

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "TERMINATE",
    details: { instanceId, ossUsageBytes },
  });

  return { workspaceId, ossUsageBytes };
}

export async function deleteWorkspace(userId: string, workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)),
  });
  if (!workspace) throw new WorkspaceError("Workspace not found", 404);

  const state = await db.query.workspaceStates.findFirst({
    where: eq(workspaceStates.workspaceId, workspaceId),
  });

  const creds = await getUserCredentials(userId);
  if (state?.instanceId) {
    try {
      await deleteInstance(creds, workspace.region, state.instanceId);
    } catch (e) {
      console.error("delete instance failed", e);
    }
  }

  // Delete OSS prefix ws-{id}/.
  const { deletePrefix } = await import("@/lib/aliyun/oss");
  try {
    await deletePrefix(
      creds,
      workspace.region,
      ossBucketForRegion(workspace.region),
      `ws-${workspaceId}/`,
    );
  } catch (e) {
    console.error("delete OSS prefix failed", e);
  }

  // Cascade deletes workspace_states + audit_logs via FK (state), but delete explicitly too.
  await db
    .delete(workspaceStates)
    .where(eq(workspaceStates.workspaceId, workspaceId));
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

  const state = await db.query.workspaceStates.findFirst({
    where: eq(workspaceStates.workspaceId, workspaceId),
  });
  if (!state?.instanceId) {
    throw new WorkspaceError("Workspace is not running", 409);
  }

  const creds = await getUserCredentials(userId);
  const autoReleaseTime = new Date(
    Date.now() + hours * 3600 * 1000,
  ).toISOString();
  await modifyInstanceAutoReleaseTime(
    creds,
    workspace.region,
    state.instanceId,
    autoReleaseTime,
  );

  await db.insert(auditLogs).values({
    userId,
    workspaceId,
    action: "RENEW",
    details: { hours, instanceId: state.instanceId },
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
