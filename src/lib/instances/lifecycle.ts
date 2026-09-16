import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, instanceLogs, workspaces } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { getUserSettings } from "@/lib/aliyun/auth";
import {
  ensureRegionResources,
  ensureInstanceSecurityGroup,
} from "@/lib/ecs/provisioning";
import { buildStopHook, buildUserData } from "@/lib/userdata";
import { dispatchPreStop } from "@/lib/agent/command";
import { buildAutoReleaseTime } from "@/lib/instances/auto-release";
import { enqueueTracking } from "@/lib/instances/enqueue";
import { getAppBaseUrl, RAM_ROLE_NAME } from "@/lib/workspaces/service";

const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟（仅 PROVISIONING，BOOTING 由 agent+云兜底）

/**
 * stop-hook 总时限。
 *
 * hook 要打包快照 + 导出 code-server 配置，大仓库可能跑很久；但无限等下去
 * 实例会一直占着资源。超过这个时限仍未收到 Finished，就强制释放云资源
 * （快照可能不完整，但比卡死强，且 ECS 侧还有 AutoReleaseTime 兜底）。
 */
const RELEASE_HOOK_DEADLINE_MS = 10 * 60 * 1000;

/** pre-stop 未 ack 的重发间隔（避免每 tick 都重发刷 agent） */
const RELEASE_PRESTOP_REDISPATCH_GAP_MS = 60 * 1000;

/**
 * TERMINATING 的静默期。
 *
 * 释放收尾 `advanceReleaseRow` 在一次请求内写完 TERMINATING → 删云 → 落库，
 * 这几百毫秒内若另一个请求的 poll 也抓到同一行，会与前者抢收尾
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
        publicIp: instances.publicIp,
        accessToken: instances.accessToken,
        workspaceId: instances.workspaceId,
        provider: workspaces.provider,
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
    .set({
      status: "RELEASING",
      releaseRequestedAt: new Date(),
      stopReason: "idle_release",
      updatedAt: new Date(),
    })
    .where(eq(instances.id, row.id));

  try {
    if (!row.publicIp) {
      throw new Error("instance.publicIp is empty");
    }
    await dispatchPreStop({
      instanceId: row.id,
      workspaceId: row.workspaceId,
      publicIp: row.publicIp,
      accessToken: row.accessToken ?? "",
      script: buildStopHook(),
      reason: "idle_release",
    });
    await db
      .update(instances)
      .set({ preStopDispatchedAt: new Date(), updatedAt: new Date() })
      .where(eq(instances.id, row.id));
  } catch (e) {
    // 下发失败不抛异常，poll 的 advanceReleaseRow 会在宽限期内重试
    console.error("[releaseIdleInstance] pre-stop dispatch failed:", e);
  }

  // 空闲释放同样走云函数 poll 收尾（删 ECS / 落 STOPPED），
  // 与其他五条释放入口（stop / releaseIdleWorkspace 等）一致，必须入队。
  // 参考 docs/CLOUD-FUNCTION-WORKERS.md §D4：idle 释放也需要 poll 推进。
  await enqueueTracking("release", row.id, row.provider);

  return "released";
}

// ─────────────────────────────────────────────────────────────
// 释放收尾（docs/AGENT-PRESTOP.md §5；由云函数 poll 驱动）
// ─────────────────────────────────────────────────────────────

interface ReleaseRow {
  id: string;
  workspaceId: string;
  status: string;
  ecsInstanceId: string | null;
  releaseRequestedAt: Date | null;
  preStopDispatchedAt: Date | null;
  preStopAckedAt: Date | null;
  publicIp: string | null;
  accessToken: string | null;
  ossUsageBytes: number | null;
  stopReason: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  provider: string;
  region: string;
}

/**
 * 单步推进一个 RELEASING / TERMINATING 实例的释放收尾（原 resumeReleasing 的 per-row 主体，
 * 由云函数 poll 驱动，见 docs/CLOUD-FUNCTION-WORKERS.md §3）。
 *
 * 为什么需要它：`stopInstance` / `stopWorkspace` / 闲置释放只在请求里把状态置为
 * `RELEASING` 并下发 pre-stop，然后立即返回（否则同步等 agent 执行必然触发 Vercel 504）。
 * 真正「等 pre-stop ack → 删 ECS → 落库」的动作由云函数 poll 的每次调用驱动。
 *
 * **绝不能在 pre-stop 完成前删 ECS**：回收脚本是数据持久化的唯一入口
 * （`lib/userdata.ts:70-94`，打包未提交改动到 `.snapshots/`、导出 code-server 配置），
 * 提前删除会丢用户代码。
 *
 * `TERMINATING` 与 `RELEASING` 的差异：前者是心跳缺失的快速释放路径（agent 已失联，
 * pre-stop 不可能执行），直接删即可；后者是主动停止 / 闲置，必须等 agent 上报
 * ready-stop（`preStopAckedAt`）。
 *
 * 返回 "SUCCEEDED"（行已到终态，任务自终）或 "PENDING"（还需继续轮询）。
 */
async function advanceReleaseRow(row: ReleaseRow): Promise<"SUCCEEDED" | "PENDING"> {
  // 让开正在途的快速释放（见 TERMINATING_SETTLE_MS 说明）
  if (
    row.status === "TERMINATING" &&
    row.updatedAt &&
    Date.now() - new Date(row.updatedAt).getTime() < TERMINATING_SETTLE_MS
  ) {
    return "PENDING";
  }

  // 没有云资源（创建早期就失败的行）→ 直接落 STOPPED，无需调云
  if (!row.ecsInstanceId) {
    await finalizeRelease(row.id, null, row.stopReason ?? "manual", null);
    await cleanupExpiredLogs(row.workspaceId);
    return "SUCCEEDED";
  }

  const base = row.releaseRequestedAt ?? row.createdAt;
  const overDeadline =
    !!base && Date.now() - new Date(base).getTime() > RELEASE_HOOK_DEADLINE_MS;

  let ossUsage: number | null = null;
  let hookSettled = row.status === "TERMINATING"; // 快速路径无 hook，视为已结束

  if (row.status === "RELEASING") {
    if (row.preStopAckedAt) {
      ossUsage = row.ossUsageBytes;
      hookSettled = true;
    } else {
      // pre-stop 未 ack：间隔足够时重发一次；否则留在 pending 等下一个 tick
      const lastDispatch = row.preStopDispatchedAt;
      const dueRedispatch =
        !lastDispatch ||
        Date.now() - new Date(lastDispatch).getTime() >= RELEASE_PRESTOP_REDISPATCH_GAP_MS;
      if (dueRedispatch && row.publicIp) {
        try {
          await dispatchPreStop({
            instanceId: row.id,
            workspaceId: row.workspaceId,
            publicIp: row.publicIp,
            accessToken: row.accessToken ?? "",
            script: buildStopHook(),
            reason: row.stopReason ?? undefined,
          });
          await db
            .update(instances)
            .set({ preStopDispatchedAt: new Date(), updatedAt: new Date() })
            .where(eq(instances.id, row.id));
        } catch (e) {
          console.warn("[lifecycle] pre-stop (re)dispatch failed:", (e as Error).message);
        }
      }
    }
  }

  if (!hookSettled && !overDeadline) {
    return "PENDING";
  }

  const provider = getProvider(row.provider);
  if (!provider) {
    // 未知 provider 无法删云资源：保守续轮，让云侧 AutoReleaseTime 兜金钱
    return "PENDING";
  }

  // pre-stop 已 ack，或已超时（强制收尾）→ 释放云资源
  try {
    await provider.deleteInstance(row.ecsInstanceId, row.region);
  } catch (e) {
    console.error("[lifecycle] deleteInstance failed, will retry next tick:", e);
    return "PENDING";
  }

  const forced = !hookSettled;
  await finalizeRelease(
    row.id,
    ossUsage,
    forced ? (row.stopReason ?? "manual_timeout") : (row.stopReason ?? "manual"),
    forced ? "停止脚本超时，已强制释放云资源（快照可能不完整）" : null,
  );
  await cleanupExpiredLogs(row.workspaceId);
  return "SUCCEEDED";
}

/**
 * 云函数入队的唯一调用方在 provisionInstanceCloud / workspaces·instances service，
 * 封装见 `src/lib/instances/enqueue.ts`（独立文件避免 lifecycle ↔ workspaces/service 成环）。
 */

// ─────────────────────────────────────────────────────────────
// poll 单步状态机（docs/CLOUD-FUNCTION-WORKERS.md §3）
// ─────────────────────────────────────────────────────────────

type PollStatus = "SUCCEEDED" | "FAILED" | "TIMEOUT" | "PENDING";

/**
 * 云函数 poll 端点单步：`POST /api/internal/instances/:id/poll` 调用。
 * 依据实例行当前 status 分派（§3 状态机）；所有落库一律 `WHERE status=<旧状态>`
 * 条件更新，与 agent-ready / agent-heartbeat / agent-error 并发时原子防重复推进。
 *
 * 私有件（isExpired / handleExpiredInstance / finalizeRelease / advanceReleaseRow 等）
 * 都在本文件内部复用，route 层不直接 import。
 */
export async function pollInstanceStep(instanceId: string): Promise<PollStatus> {
  const rows = await db
    .select({
      id: instances.id,
      workspaceId: instances.workspaceId,
      status: instances.status,
      ecsInstanceId: instances.ecsInstanceId,
      publicIp: instances.publicIp,
      accessToken: instances.accessToken,
      ossUsageBytes: instances.ossUsageBytes,
      stopReason: instances.stopReason,
      bootStartedAt: instances.bootStartedAt,
      createdAt: instances.createdAt,
      releaseRequestedAt: instances.releaseRequestedAt,
      preStopDispatchedAt: instances.preStopDispatchedAt,
      preStopAckedAt: instances.preStopAckedAt,
      updatedAt: instances.updatedAt,
      provider: workspaces.provider,
      region: workspaces.region,
    })
    .from(instances)
    .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
    .where(eq(instances.id, instanceId))
    .limit(1);

  const inst = rows[0];
  if (!inst) return "SUCCEEDED"; // 实例已不存在 → 幂等终态

  const now = new Date();

  switch (inst.status) {
    case "PROVISIONING": {
      const base: Instance = {
        id: inst.id,
        workspaceId: inst.workspaceId,
        status: inst.status,
        ecsInstanceId: inst.ecsInstanceId,
        bootStartedAt: inst.bootStartedAt,
        createdAt: inst.createdAt,
      };

      // 超时？（isExpired 只认 PROVISIONING：BOOTING 时长兜底在 agent + 云侧，见 W1）
      if (isExpired(base)) {
        await handleExpiredInstance(base);
        await db
          .update(instances)
          .set({ lastCloudCheckedAt: now, updatedAt: now })
          .where(and(eq(instances.id, inst.id), eq(instances.status, "PROVISIONING")));
        return "TIMEOUT";
      }

      // 未超时 → 查云状态推进
      let cloudStatus: string | null = null;
      if (inst.ecsInstanceId) {
        try {
          cloudStatus = await getCloudStatus(inst.ecsInstanceId, inst.workspaceId);
        } catch {
          cloudStatus = null;
        }
      }

      await db
        .update(instances)
        .set({
          lastCloudStatus: cloudStatus,
          lastCloudCheckedAt: now,
          updatedAt: now,
        })
        .where(and(eq(instances.id, inst.id), eq(instances.status, "PROVISIONING")));

      // 云侧确凿已释放 → FAILED（仅认 provider 返回的 "Released"；null 是瞬时
      // 网络/API 错误，不删 ECS，落 PENDING 让 poll 下端到 5min 超时再判，
      // 对齐 docs/AGENT-LIFECYCLE §3「网络失败照常重试，不产生副作用」）
      if (cloudStatus === "Released") {
        if (inst.ecsInstanceId) {
          await releaseInstance(inst.ecsInstanceId, inst.workspaceId).catch(() => {});
        }
        await db
          .update(instances)
          .set({
            status: "FAILED",
            bootError: "云实例已释放或不存在",
            updatedAt: new Date(),
          })
          .where(and(eq(instances.id, inst.id), eq(instances.status, "PROVISIONING")));
        return "FAILED";
      }

      // 云 Running → 置 BOOTING + 回填 publicIp（条件更新防与 agent 首心跳并发双推进）
      if (cloudStatus === "Running") {
        let publicIp: string | null = null;
        if (inst.ecsInstanceId) {
          try {
            const p = getProvider(inst.provider);
            publicIp = (await p?.getInstancePublicIp(inst.ecsInstanceId, inst.region)) ?? null;
          } catch {
            publicIp = null;
          }
        }
        await db
          .update(instances)
          .set({
            status: "BOOTING",
            ...(publicIp ? { publicIp } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(instances.id, inst.id), eq(instances.status, "PROVISIONING")));
      }

      return "PENDING";
    }

    case "BOOTING": {
      // poll 不杀 BOOTING（W1：时长兜底在 agent 侧 entry_timeout 上报 → FAILED 与云 AutoReleaseTime）。
      // 只落 lastCloudCheckedAt，等 agent-ready → RUNNING。
      await db
        .update(instances)
        .set({ lastCloudCheckedAt: now, updatedAt: now })
        .where(and(eq(instances.id, inst.id), eq(instances.status, "BOOTING")));
      return "PENDING";
    }

    case "RELEASING":
    case "TERMINATING": {
      await db
        .update(instances)
        .set({ lastCloudCheckedAt: now, updatedAt: now })
        .where(and(eq(instances.id, inst.id), eq(instances.status, inst.status)));
      return advanceReleaseRow(inst);
    }

    default: {
      // RUNNING / STOPPED / FAILED / 其它终态：无事可做，幂等自终
      await db
        .update(instances)
        .set({ lastCloudCheckedAt: now, updatedAt: now })
        .where(and(eq(instances.id, inst.id), eq(instances.status, inst.status)));
      return "SUCCEEDED";
    }
  }
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

/**
 * 为一个已落库的 `PROVISIONING` 实例创建云资源：探测基础资源 → 安全组 → RunInstances。
 *
 * 主路径由 `createInstance`（instances/service.ts）调用，用户请求内同步跑完。
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

  // 触发云函数轮询跟踪（fire-and-forget，失败仅 log，不阻塞创建主流程）
  void enqueueTracking("create", row.id, row.provider);
}


