import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, workspaces } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";

const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟

interface Instance {
  id: string;
  workspaceId: string;
  status: string;
  ecsInstanceId: string | null;
  bootStartedAt: Date | null;
  createdAt: Date | null;
}

async function getTimeoutInstances(
  userId: string,
  workspaceId?: string,
): Promise<Instance[]> {
  const conditions = [
    inArray(instances.status, ["PROVISIONING", "BOOTING"]),
  ];

  if (workspaceId) {
    conditions.push(eq(instances.workspaceId, workspaceId));
  } else {
    const userWorkspaces = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.userId, userId));
    const workspaceIds = userWorkspaces.map((w) => w.id);
    if (workspaceIds.length === 0) return [];
    conditions.push(inArray(instances.workspaceId, workspaceIds));
  }

  const rows = await db
    .select({
      id: instances.id,
      workspaceId: instances.workspaceId,
      status: instances.status,
      ecsInstanceId: instances.ecsInstanceId,
      bootStartedAt: instances.bootStartedAt,
      createdAt: instances.createdAt,
    })
    .from(instances)
    .where(and(...conditions));

  return rows;
}

function isExpired(instance: Instance): boolean {
  if (!["PROVISIONING", "BOOTING"].includes(instance.status)) return false;

  const bootStartedAt = instance.bootStartedAt ?? instance.createdAt;
  if (!bootStartedAt) return false;

  const elapsed = Date.now() - new Date(bootStartedAt).getTime();
  return elapsed >= BOOT_TIMEOUT_MS;
}

async function getCloudStatus(
  ecsInstanceId: string,
  workspaceId: string,
): Promise<string | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) return null;

  const provider = getProvider(workspace.provider);
  if (!provider) return null;

  try {
    return await provider.getInstanceCloudStatus(ecsInstanceId, workspace.region);
  } catch {
    return null;
  }
}

async function releaseInstance(
  ecsInstanceId: string,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) return false;

  const provider = getProvider(workspace.provider);
  if (!provider) return false;

  try {
    await provider.deleteInstance(ecsInstanceId);
    return true;
  } catch (e) {
    console.error("[lifecycle] Failed to release instance:", e);
    return false;
  }
}

async function handleExpiredInstance(instance: Instance): Promise<void> {
  if (!instance.ecsInstanceId) {
    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: "启动超时：未获取到云实例 ID",
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instance.id));
    return;
  }

  const cloudStatus = await getCloudStatus(instance.ecsInstanceId, instance.workspaceId);

  if (cloudStatus === "Released" || cloudStatus === null) {
    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: "启动超时：云实例已释放",
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instance.id));
    return;
  }

  if (["Running", "Starting", "Pending"].includes(cloudStatus ?? "")) {
    const released = await releaseInstance(instance.ecsInstanceId, instance.workspaceId);
    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: released
          ? "启动超时：云实例已释放"
          : "启动超时：释放云实例失败",
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instance.id));
    return;
  }

  await db
    .update(instances)
    .set({
      status: "FAILED",
      bootError: `启动超时：云实例状态 ${cloudStatus}`,
      updatedAt: new Date(),
    })
    .where(eq(instances.id, instance.id));
}

export async function checkAndFixTimeouts(
  userId: string,
  workspaceId?: string,
): Promise<{ checked: number; fixed: number }> {
  const candidates = await getTimeoutInstances(userId, workspaceId);
  let fixed = 0;

  for (const instance of candidates) {
    if (isExpired(instance)) {
      await handleExpiredInstance(instance);
      fixed++;
    }
  }

  return { checked: candidates.length, fixed };
}
