import { and, eq, inArray, isNull, isNotNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, instanceLogs, workspaces } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { getUserSettings } from "@/lib/aliyun/auth";
import {
  ensureRegionResources,
  ensureInstanceSecurityGroup,
  invalidateRegionResources,
} from "@/lib/ecs/provisioning";
import { buildStopHook, buildUserData } from "@/lib/userdata";
import { buildAutoReleaseTime } from "@/lib/instances/auto-release";
import { getAppBaseUrl, RAM_ROLE_NAME, releaseIdleWorkspace } from "@/lib/workspaces/service";

const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000; // 心跳缺失判定：3 分钟
const DEFAULT_IDLE_MINUTES = 30;

/**
 * stop-hook 总时限。
 *
 * hook 要打包快照 + 导出 code-server 配置，大仓库可能跑很久；但无限等下去
 * 实例会一直占着资源。超过这个时限仍未收到 Finished，就强制释放云资源
 * （快照可能不完整，但比卡死强，且 ECS 侧还有 AutoReleaseTime 兜底）。
 */
const RELEASE_HOOK_DEADLINE_MS = 10 * 60 * 1000;

/** 投递失败后的重试宽限：这段时间内允许重新投递 hook */
const RELEASE_REDISPATCH_GRACE_MS = 60 * 1000;

/** 单次 tick 内最多收尾几个实例，避免请求总时长失控 */
const RELEASE_MAX_PER_TICK = 4;

/** 单个实例在一个 tick 内最多轮询几次命令结果 */
const RELEASE_POLL_ATTEMPTS = 2;
const RELEASE_POLL_GAP_MS = 1500;

/**
 * TERMINATING 的静默期。
 *
 * `reapStale` / `releaseIdleWorkspace` 会在一次请求内写完 TERMINATING → 删云 → 落库，
 * 这几百毫秒内若另一个请求的 resumeReleasing 也抓到同一行，会与前者抢收尾
 * （一方写 STOPPED、一方写 FAILED）。静默期把这种在途行让出去。
 * 真正卡死的 TERMINATING 只是晚 30s 被回收，代价可以接受。
 */
const TERMINATING_SETTLE_MS = 30_000;

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
  // W1 只收 PROVISIONING：BOOTING 的时长兜底在 agent 侧（entry_timeout 上报）
  // 与云侧 AutoReleaseTime（docs/AGENT-LIFECYCLE.md §3 W1/W2）。
  const conditions = [
    eq(instances.status, "PROVISIONING"),
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
  if (instance.status !== "PROVISIONING") return false;

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
 * 心跳租约续期（docs/AGENT-LIFECYCLE.md §5 W3）。
 *
 * 触发条件：`auto_release_at` 为 NULL 或剩余 ≤10min。
 * 取值链 `workspace.autoRenewalMinutes ?? settings.defaultAutoRenewalMinutes`；
 * NULL 视为需续期，兜底存量行。
 *
 * 仅当云侧调用成功（或该 provider 不支持自动释放，视为无需云调用）时才回写 DB；
 * 云侧失败保持旧值，等待下次心跳重试（云侧 AutoReleaseTime 是最终兜底）。
 */
export async function renewInstanceLease(
  instanceId: string,
): Promise<{ renewed: boolean; autoReleaseAt?: Date }> {
  const row = (
    await db
      .select({
        id: instances.id,
        userId: workspaces.userId,
        ecsInstanceId: instances.ecsInstanceId,
        autoReleaseAt: instances.autoReleaseAt,
        autoRenewalMinutes: workspaces.autoRenewalMinutes,
        provider: workspaces.provider,
        region: workspaces.region,
      })
      .from(instances)
      .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
      .where(eq(instances.id, instanceId))
      .limit(1)
  )[0];

  if (!row || !row.ecsInstanceId) return { renewed: false };

  const nowMs = Date.now();
  const remainingMs = row.autoReleaseAt
    ? new Date(row.autoReleaseAt).getTime() - nowMs
    : -1;
  if (row.autoReleaseAt && remainingMs > 10 * 60 * 1000) {
    return { renewed: false };
  }

  let autoRenewalMinutes = row.autoRenewalMinutes;
  if (!autoRenewalMinutes) {
    try {
      const s = await getUserSettings(row.userId);
      autoRenewalMinutes = s.defaultAutoRenewalMinutes;
    } catch {
      autoRenewalMinutes = 35;
    }
  }

  const nextIso = buildAutoReleaseTime(autoRenewalMinutes);
  const provider = getProvider(row.provider);
  if (provider && provider.supportsAutoRelease) {
    try {
      await provider.setAutoReleaseTime(row.ecsInstanceId, row.region, nextIso);
    } catch (e) {
      console.warn("[lifecycle] renewInstanceLease cloud call failed:", e);
      return { renewed: false };
    }
  }

  await db
    .update(instances)
    .set({ autoReleaseAt: new Date(nextIso), updatedAt: new Date() })
    .where(eq(instances.id, row.id));

  return { renewed: true, autoReleaseAt: new Date(nextIso) };
}

/**
 * 单实例空闲即时释放（心跳 `is_idle=true` 专用，docs/AGENT-LIFECYCLE.md §5）。
 *
 * 与 `releaseIdle`（扫描式）共用「快速路径」语义：不跑 stop-hook，直接删 ECS。
 * 仅 RUNNING 生效；BOOTING / PROVISIONING 忽略（心跳路由已按此过滤）。
 */
export async function releaseIdleInstance(
  instanceId: string,
): Promise<"released" | "skipped"> {
  const row = (
    await db
      .select({
        id: instances.id,
        status: instances.status,
        ecsInstanceId: instances.ecsInstanceId,
        provider: workspaces.provider,
        region: workspaces.region,
      })
      .from(instances)
      .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
      .where(eq(instances.id, instanceId))
      .limit(1)
  )[0];

  if (!row) throw new Error(`实例不存在：${instanceId}`);
  if (row.status !== "RUNNING" || !row.ecsInstanceId) return "skipped";

  await db
    .update(instances)
    .set({ status: "TERMINATING", updatedAt: new Date() })
    .where(eq(instances.id, row.id));

  const provider = getProvider(row.provider);
  if (!provider) throw new Error(`Unknown provider: ${row.provider}`);

  try {
    await provider.deleteInstance(row.ecsInstanceId, row.region);
  } catch (e) {
    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: "空闲释放失败：云资源删除失败",
        updatedAt: new Date(),
      })
      .where(eq(instances.id, row.id));
    throw e;
  }

  await db
    .update(instances)
    .set({
      status: "STOPPED",
      publicIp: null,
      port: null,
      accessToken: null,
      autoReleaseAt: null,
      stoppedAt: new Date(),
      stopReason: "idle_release",
      updatedAt: new Date(),
    })
    .where(eq(instances.id, row.id));

  return "released";
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

  let reaped = 0;

  for (const row of rows) {
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
        ...(released
          ? { publicIp: null, port: null, accessToken: null, autoReleaseAt: null, stoppedAt: new Date() }
          : {}),
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

// ─────────────────────────────────────────────────────────────
// 异步停止收尾（docs/UI-PERFORMANCE.md U1）
// ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOssUsage(output: string | null | undefined): number | null {
  if (!output) return null;
  const match = output.match(/OSS_USAGE=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 停止流程的收尾器。
 *
 * 为什么需要它：`stopInstance` / `stopWorkspace` 只在请求里把状态置为 `RELEASING`
 * 并投递 stop-hook，然后立即返回（否则 120s 同步等待必然触发 Vercel 504）。
 * 真正「等 hook 跑完 → 删 ECS → 落库」的动作放在这里，由 `/api/maintenance`
 * 的每次 tick 驱动（serverless 无后台进程，一切时序挂在请求上）。
 *
 * **绝不能在 hook 完成前删 ECS**：stop-hook 是数据持久化的唯一入口
 * （`lib/userdata.ts:70-94`，打包未提交改动到 `.snapshots/`、导出 code-server 配置），
 * 提前删除会丢用户代码。
 *
 * `TERMINATING` 与 `RELEASING` 的差异：前者来自空闲/失联的快速释放路径
 * （`releaseIdleWorkspace`、`reapStale`），本来就不跑 hook，直接删即可；
 * 后者是用户主动停止，必须等 hook。
 */
export async function resumeReleasing(
  userId: string,
): Promise<{ finalized: number; pending: number; failed: number }> {
  const rows = await db
    .select({
      id: instances.id,
      status: instances.status,
      workspaceId: instances.workspaceId,
      ecsInstanceId: instances.ecsInstanceId,
      stopInvokeId: instances.stopInvokeId,
      releaseRequestedAt: instances.releaseRequestedAt,
      stopReason: instances.stopReason,
      createdAt: instances.createdAt,
      updatedAt: instances.updatedAt,
      provider: workspaces.provider,
      region: workspaces.region,
    })
    .from(instances)
    .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
    .where(
      and(
        eq(workspaces.userId, userId),
        inArray(instances.status, ["RELEASING", "TERMINATING"]),
      ),
    )
    .limit(RELEASE_MAX_PER_TICK);

  let finalized = 0;
  let pending = 0;
  let failed = 0;

  for (const row of rows) {
    // 让开正在途的快速释放（见 TERMINATING_SETTLE_MS 说明）
    if (
      row.status === "TERMINATING" &&
      row.updatedAt &&
      Date.now() - new Date(row.updatedAt).getTime() < TERMINATING_SETTLE_MS
    ) {
      pending++;
      continue;
    }

    const provider = getProvider(row.provider);
    if (!provider) {
      failed++;
      continue;
    }

    // 没有云资源（创建早期就失败的行）→ 直接落 STOPPED，无需调云
    if (!row.ecsInstanceId) {
      await finalizeRelease(row.id, null, row.stopReason ?? "manual", null);
      await cleanupExpiredLogs(row.workspaceId);
      finalized++;
      continue;
    }

    const base = row.releaseRequestedAt ?? row.createdAt;
    const overDeadline =
      !!base && Date.now() - new Date(base).getTime() > RELEASE_HOOK_DEADLINE_MS;

    let ossUsage: number | null = null;
    let hookSettled = row.status === "TERMINATING"; // 快速路径无 hook，视为已结束

    if (row.status === "RELEASING") {
      if (row.stopInvokeId) {
        for (let i = 0; i < RELEASE_POLL_ATTEMPTS; i++) {
          try {
            const result = await provider.getCommandResult(row.stopInvokeId, row.region);
            // 关键：必须判状态，原实现在这里只看 output，hook 失败就空等满 120s
            if (result.status === "Finished" || result.status === "Failed" || result.status === "Stopped") {
              ossUsage = parseOssUsage(result.output);
              hookSettled = true;
              break;
            }
          } catch (e) {
            console.warn("[lifecycle] getCommandResult failed:", (e as Error).message);
            break;
          }
          if (i < RELEASE_POLL_ATTEMPTS - 1) await sleep(RELEASE_POLL_GAP_MS);
        }
      } else {
        // 请求路径投递失败过。宽限期内重新投递一次，之后交给超时兜底。
        const withinGrace =
          !!base && Date.now() - new Date(base).getTime() < RELEASE_REDISPATCH_GRACE_MS;
        if (withinGrace) {
          try {
            const { invokeId } = await provider.runCommand(
              row.ecsInstanceId,
              row.region,
              buildStopHook(),
            );
            await db
              .update(instances)
              .set({ stopInvokeId: invokeId, updatedAt: new Date() })
              .where(eq(instances.id, row.id));
          } catch (e) {
            console.warn("[lifecycle] stop-hook redispatch failed:", (e as Error).message);
          }
        }
      }
    }

    if (!hookSettled && !overDeadline) {
      pending++;
      continue;
    }

    // hook 已结束，或已超时（强制收尾）→ 释放云资源
    try {
      await provider.deleteInstance(row.ecsInstanceId, row.region);
    } catch (e) {
      console.error("[lifecycle] deleteInstance failed, will retry next tick:", e);
      failed++;
      continue;
    }

    const forced = !hookSettled;
    await finalizeRelease(
      row.id,
      ossUsage,
      forced
        ? row.status === "TERMINATING"
          ? (row.stopReason ?? "idle_release")
          : "manual_timeout"
        : (row.stopReason ?? "manual"),
      forced ? "停止脚本超时，已强制释放云资源（快照可能不完整）" : null,
    );
    await cleanupExpiredLogs(row.workspaceId);
    finalized++;
  }

  return { finalized, pending, failed };
}

/** 默认日志保留天数；`settings.logRetentionDays` 缺失时兜底。 */
const DEFAULT_LOG_RETENTION_DAYS = 7;

/** 取实例所属用户，用于读取该用户的偏好设置。 */
async function getInstanceOwner(instanceId: string): Promise<string | null> {
  const row = (
    await db
      .select({ userId: workspaces.userId })
      .from(instances)
      .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
      .where(eq(instances.id, instanceId))
      .limit(1)
  )[0];
  return row?.userId ?? null;
}

/**
 * 收尾落库：清空访问凭据、写停止时间、按用户偏好挂日志过期。
 *
 * 日志保留天数读 `settings.logRetentionDays`（用户级偏好，不随工作区快照）。
 * 之前这里硬编码 7 天，导致设置页的「日志保留」形同虚设 —— 清理逻辑
 * （`cleanupExpiredLogs`）本身是好的，只是过期时间从来没按设置算过。
 */
async function finalizeRelease(
  instanceId: string,
  ossUsageBytes: number | null,
  stopReason: string,
  bootError: string | null,
): Promise<void> {
  const userId = await getInstanceOwner(instanceId);
  let retentionDays = DEFAULT_LOG_RETENTION_DAYS;
  if (userId) {
    try {
      const s = await getUserSettings(userId);
      retentionDays = s.logRetentionDays ?? DEFAULT_LOG_RETENTION_DAYS;
    } catch (e) {
      // 设置读不到不该阻塞释放收尾，退回默认值
      console.warn("[lifecycle] log retention lookup failed, using default:", e);
    }
  }

  await db
    .update(instances)
    .set({
      status: "STOPPED",
      publicIp: null,
      port: null,
      accessToken: null,
      autoReleaseAt: null,
      stopInvokeId: null,
      releaseRequestedAt: null,
      ossUsageBytes,
      stopReason,
      stoppedAt: new Date(),
      logsExpireAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      bootError,
      updatedAt: new Date(),
    })
    .where(eq(instances.id, instanceId));
}

/** 清理已经过了 logsExpireAt 的停止实例日志。 */
export async function cleanupExpiredLogs(workspaceId: string): Promise<void> {
  try {
    const stoppedInstances = await db.query.instances.findMany({
      where: and(
        eq(instances.workspaceId, workspaceId),
        eq(instances.status, "STOPPED"),
      ),
    });

    const now = new Date();
    for (const inst of stoppedInstances) {
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

// ─────────────────────────────────────────────────────────────
// 异步创建（docs/UI-PERFORMANCE.md U9）
// ─────────────────────────────────────────────────────────────

/** 认领有效期：超过它说明上一次创建尝试已经死了，允许别人接手 */
const PROVISION_CLAIM_MS = 2 * 60 * 1000;

/** 一个 tick 内最多创建几个实例，避免请求时长失控 */
const PROVISION_MAX_PER_TICK = 2;

/**
 * 判断失败是否源于「云侧基础资源已不存在」——通常是用户在云控制台手删了
 * VPC / VSwitch / 安全组 / 镜像。这类失败重试一万次也没用，必须重探测基础资源。
 */
function isStaleResourceError(message: string): boolean {
  return /InvalidVpcID|InvalidVSwitchId|InvalidSecurityGroupId|InvalidImageId|NotFound|not exist|does not exist|InvalidSystemDiskCategory/i.test(
    message,
  );
}

/**
 * 为一个已落库的 `PROVISIONING` 实例创建云资源：探测基础资源 → 安全组 → RunInstances。
 *
 * 两个调用方：
 *   1. `createInstance`（**用户请求内同步跑完**，主路径）
 *   2. `resumeProvisioning`（maintenance tick，只兜底请求中断/超时的孤儿行）
 *
 * 之所以现在能同步跑：基础网络资源（VPC/VSwitch/镜像/共享安全组）已落库
 * （`region_resources`），常规路径只剩 2 次云 API、1~3 秒。
 * 见 docs/UI-PERFORMANCE.md U9 与「反转」记录。
 *
 * 幂等：`ecsInstanceId` 已有值时直接返回，不会重复建 ECS。
 */
export async function provisionInstanceCloud(instanceId: string): Promise<void> {
  const row = (
    await db
      .select({
        id: instances.id,
        workspaceId: instances.workspaceId,
        cloudInstanceId: instances.cloudInstanceId,
        diskSize: instances.diskSize,
        bandwidth: instances.bandwidth,
        useSpot: instances.useSpot,
        accessToken: instances.accessToken,
        ecsInstanceId: instances.ecsInstanceId,
        provider: workspaces.provider,
        region: workspaces.region,
        userId: workspaces.userId,
      })
      .from(instances)
      .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
      .where(eq(instances.id, instanceId))
      .limit(1)
  )[0];

  if (!row) throw new Error(`实例不存在：${instanceId}`);
  if (row.ecsInstanceId) return;

  const provider = getProvider(row.provider);
  if (!provider) throw new Error(`Unknown provider: ${row.provider}`);

  const cloudInstance = row.cloudInstanceId
    ? await db.query.cloudInstances.findFirst({
        where: (t, { eq: e }) => e(t.id, row.cloudInstanceId!),
      })
    : null;
  if (!cloudInstance) throw new Error("弹性规格不存在或已被删除");

  const creds = await provider.getCredentials(row.userId);
  const resources = await ensureRegionResources(creds, row.region, {
    userId: row.userId,
    provider: row.provider,
  });
  // 复用 ensureRegionResources 已拉到的安全组列表，省掉一次 DescribeSecurityGroups
  const instanceSgId = await ensureInstanceSecurityGroup(
    creds,
    row.region,
    resources.vpcId,
    row.id,
    resources.securityGroups,
  );

  const settings = await getUserSettings(row.userId);
  const autoRenewalMinutes =
    (
      await db.query.workspaces.findFirst({
        where: (t, { eq: e }) => e(t.id, row.workspaceId),
      })
    )?.autoRenewalMinutes ?? settings.defaultAutoRenewalMinutes;

  const autoReleaseTime = buildAutoReleaseTime(autoRenewalMinutes);

  const userData = buildUserData({
    instanceId: row.id,
    callbackUrl: getAppBaseUrl(),
    accessToken: row.accessToken ?? "",
  });

  const ecsInstanceId = await provider.createInstance({
    region: row.region,
    imageId: resources.imageId,
    instanceType: cloudInstance.instanceType,
    securityGroupId: instanceSgId,
    vSwitchId: resources.vSwitchId,
    ramRoleName: RAM_ROLE_NAME,
    diskCategory: "cloud_essd",
    diskSize: row.diskSize,
    bandwidth: row.bandwidth,
    // 抢占由本次启动的开关决定（instances.use_spot，由 createInstance 落库）；
    // 保障时长是全局偏好，读 settings.default_spot_duration（0 或 1）。
    spotStrategy: row.useSpot ? "SpotAsPriceGo" : "NoSpot",
    spotDuration: row.useSpot ? settings.defaultSpotDuration ?? 1 : 1,
    spotPriceLimit: null,
    autoReleaseTime,
    userData,
    tags: { "instance-id": row.id, "managed-by": "workspace-cloud" },
  });

  await db
    .update(instances)
    .set({
      ecsInstanceId,
      securityGroupId: instanceSgId,
      autoReleaseAt: new Date(autoReleaseTime),
      updatedAt: new Date(),
    })
    .where(eq(instances.id, row.id));
}

/**
 * 兜底：完成「已落库但还没建云资源」的实例创建。
 *
 * 主路径已经是 `createInstance` 里的同步创建；这里只处理**孤儿行** ——
 * 比如用户请求超时/中断、或创建时云侧临时失败后留下的 `PROVISIONING` 且
 * `ecs_instance_id` 为空的行。由 `/api/maintenance` tick 驱动。
 *
 * 并发安全：通过 `provision_claimed_at` 做**原子认领** —— 条件 UPDATE 的
 * returning 为空说明另一个请求已经认领（或正在同步创建中），直接跳过，
 * 不会重复建资源。
 */
export async function resumeProvisioning(
  userId: string,
): Promise<{ provisioned: number; skipped: number; failed: number }> {
  const candidates = await db
    .select({
      id: instances.id,
      workspaceId: instances.workspaceId,
      cloudInstanceId: instances.cloudInstanceId,
      diskSize: instances.diskSize,
      bandwidth: instances.bandwidth,
      useSpot: instances.useSpot,
      accessToken: instances.accessToken,
      provider: workspaces.provider,
      region: workspaces.region,
      userId: workspaces.userId,
    })
    .from(instances)
    .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
    .where(
      and(
        eq(workspaces.userId, userId),
        eq(instances.status, "PROVISIONING"),
        isNull(instances.ecsInstanceId),
      ),
    )
    .limit(PROVISION_MAX_PER_TICK);

  let provisioned = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    // 原子认领
    const staleBefore = new Date(Date.now() - PROVISION_CLAIM_MS);
    const claimed = await db
      .update(instances)
      .set({ provisionClaimedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(instances.id, row.id),
          isNull(instances.ecsInstanceId),
          or(
            isNull(instances.provisionClaimedAt),
            lt(instances.provisionClaimedAt, staleBefore),
          ),
        ),
      )
      .returning({ id: instances.id });

    if (claimed.length === 0) {
      skipped++;
      continue;
    }

    try {
      await provisionInstanceCloud(row.id);
      provisioned++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[lifecycle] resumeProvisioning failed:", message);

      // 云侧基础资源被手删（VPC / VSwitch / 安全组 / 镜像）时，缓存里的 ID 就是脏的。
      // 主动作废，让下一次 tick 重新探测，否则会一直用同一组失效 ID 重试失败。
      if (isStaleResourceError(message)) {
        await invalidateRegionResources(row.userId, row.region, row.provider).catch(
          (ie) =>
            console.warn(
              "[lifecycle] invalidateRegionResources failed:",
              (ie as Error).message,
            ),
        );
      }

      await db
        .update(instances)
        .set({
          status: "FAILED",
          bootError: message,
          updatedAt: new Date(),
        })
        .where(eq(instances.id, row.id));
      failed++;
    }
  }

  return { provisioned, skipped, failed };
}
