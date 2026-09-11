import { and, eq, inArray, isNull, isNotNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, workspaces } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { releaseIdleWorkspace } from "@/lib/workspaces/service";

const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000; // 心跳缺失判定：3 分钟
const DEFAULT_IDLE_MINUTES = 30;

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
    await provider.deleteInstance(ecsInstanceId, workspace.region);
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

/**
 * 空闲释放：扫描该用户下满足空闲条件的 RUNNING 实例并释放。
 *
 * 由前端在打开页面 / 轮询时触发（serverless 无后台进程，不做定时）。
 * 纯数据库判据，不依赖 agent：`now - lastActiveAt >= idleMinutes`。
 */
export async function releaseIdle(
  userId: string,
): Promise<{ released: string[]; failed: string[] }> {
  const rows = await db
    .select({
      userId: workspaces.userId,
      workspaceId: instances.workspaceId,
      lastActiveAt: instances.lastActiveAt,
      createdAt: instances.createdAt,
      idleMinutes: workspaces.idleMinutes,
    })
    .from(instances)
    .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
    .where(
      and(
        eq(instances.status, "RUNNING"),
        eq(workspaces.userId, userId),
      ),
    );

  const now = Date.now();
  const released: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    const idleMinutes = row.idleMinutes ?? DEFAULT_IDLE_MINUTES;
    const base = row.lastActiveAt ?? row.createdAt;
    if (!base) continue;
    if (now - new Date(base).getTime() < idleMinutes * 60 * 1000) continue;

    try {
      // 空闲释放不走完整的 stop-hook（可能耗时 120s），直接快速删 ECS
      await releaseIdleWorkspace(row.userId, row.workspaceId);
      released.push(row.workspaceId);
    } catch (e) {
      console.error("[lifecycle] releaseIdle failed:", e);
      failed.push(row.workspaceId);
    }
  }

  return { released, failed };
}

/**
 * 心跳缺失回收：RUNNING/BOOTING 且 `lastHeartbeatAt` 超时的实例标记为 FAILED。
 *
 * 由前端触发。心跳由 agent 侧推送（见 §9.4 agent-heartbeat）。
 */
export async function reapStale(
  userId: string,
): Promise<{ reaped: number }> {
  const userWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.userId, userId));
  const workspaceIds = userWorkspaces.map((w) => w.id);
  if (workspaceIds.length === 0) return { reaped: 0 };

  const deadline = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const rows = await db
    .select({
      id: instances.id,
      status: instances.status,
      bootStartedAt: instances.bootStartedAt,
      createdAt: instances.createdAt,
    })
    .from(instances)
    .where(
      and(
        inArray(instances.workspaceId, workspaceIds),
        inArray(instances.status, ["BOOTING", "RUNNING"]),
        or(
          isNull(instances.lastHeartbeatAt),
          lt(instances.lastHeartbeatAt, deadline),
        ),
        isNotNull(instances.ecsInstanceId),
      ),
    );

  const now = Date.now();
  let reaped = 0;

  for (const row of rows) {
    // BOOTING 交给启动超时逻辑；这里只处理已过启动窗口的
    const bootBase = row.bootStartedAt ?? row.createdAt;
    if (row.status === "BOOTING" && bootBase && now - new Date(bootBase).getTime() < BOOT_TIMEOUT_MS) {
      continue;
    }

    // 心跳缺失且 ECS 还在跑 → 先释放云资源，再标记失败，避免空烧钱
    await db
      .update(instances)
      .set({ status: "TERMINATING", updatedAt: new Date() })
      .where(eq(instances.id, row.id));

    const released = await releaseInstanceForRow(row.id);

    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: released ? "心跳缺失：agent 失联，云资源已释放" : "心跳缺失：agent 失联，释放资源失败",
        ...(released ? { publicIp: null, port: null, accessToken: null, stoppedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(instances.id, row.id));
    reaped++;
  }

  return { reaped };
}

/**
 * 为 RUNNING 但还没 publicIp 的实例补一次云 API 查询。
 * agent-ready 可能因云 API 抖动没拿到 IP，这里由前端懒维护兜底。
 */
export async function backfillInstanceIps(
  userId: string,
): Promise<{ checked: number; filled: number; failed: number }> {
  const userWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.userId, userId));
  const workspaceIds = userWorkspaces.map((w) => w.id);
  if (workspaceIds.length === 0) return { checked: 0, filled: 0, failed: 0 };

  const rows = await db
    .select({
      id: instances.id,
      ecsInstanceId: instances.ecsInstanceId,
      provider: workspaces.provider,
      region: workspaces.region,
    })
    .from(instances)
    .innerJoin(workspaces, eq(instances.workspaceId, workspaces.id))
    .where(
      and(
        inArray(instances.workspaceId, workspaceIds),
        inArray(instances.status, ["RUNNING", "BOOTING"]),
        isNull(instances.publicIp),
        isNotNull(instances.ecsInstanceId),
      ),
    );

  let filled = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const provider = getProvider(row.provider);
      const ip = await provider?.getInstancePublicIp(row.ecsInstanceId!, row.region);
      if (ip) {
        await db
          .update(instances)
          .set({ publicIp: ip, updatedAt: new Date() })
          .where(eq(instances.id, row.id));
        filled++;
      }
    } catch (e) {
      console.warn("[lifecycle] backfill ip failed:", (e as Error).message);
      failed++;
    }
  }

  return { checked: rows.length, filled, failed };
}

async function releaseInstanceForRow(instanceId: string): Promise<boolean> {
  const row = await db
    .select({ ecsInstanceId: instances.ecsInstanceId, workspaceId: instances.workspaceId })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .limit(1);
  const inst = row[0];
  if (!inst?.ecsInstanceId) return true;
  return releaseInstance(inst.ecsInstanceId, inst.workspaceId);
}
