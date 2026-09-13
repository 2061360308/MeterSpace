import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import {
  checkAndFixTimeouts,
  reapStale,
  releaseIdle,
  backfillInstanceIps,
  resumeReleasing,
  resumeProvisioning,
} from "@/lib/instances/lifecycle";
import { ok, fail } from "@/lib/api";

/**
 * 懒处理入口：由前端在打开页面 / 定时轮询时调用。
 *
 * serverless 无后台进程，所有时序逻辑都靠请求触发（见 docs/FINAL-PLAN.md 第 10 章）。
 * 这也是本项目唯一能"跑任务"的地方 —— 任何异步化的慢操作，收尾都要挂到这里。
 */

const TASKS = ["provision", "timeout", "release", "idle", "stale", "ip"] as const;
type Task = (typeof TASKS)[number];

const bodySchema = z.object({
  /** 要执行的检查项，缺省全跑 */
  tasks: z.array(z.enum(TASKS)).default([...TASKS]),
});

/**
 * 单个任务自治执行：失败只记录错误，不阻塞其它任务。
 */
async function runTask<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[maintenance] ${label} failed:`, e);
    return { error: (e as Error).message };
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let parsed: { tasks: Task[] } = {
      tasks: [...TASKS],
    };
    try {
      parsed = bodySchema.parse(await req.json());
    } catch {
      // 无 body 时按全量处理
    }

    const result: Record<string, unknown> = {};

    // 异步创建：先建云资源，再让 timeout 去判超时（顺序不能反）
    if (parsed.tasks.includes("provision")) {
      result.provision = await runTask("provision", () => resumeProvisioning(userId));
    }
    if (parsed.tasks.includes("timeout")) {
      result.timeout = await runTask("timeout", () => checkAndFixTimeouts(userId));
    }
    // 异步停止的收尾：等 stop-hook 跑完再删 ECS（docs/UI-PERFORMANCE.md U1）
    if (parsed.tasks.includes("release")) {
      result.release = await runTask("release", () => resumeReleasing(userId));
    }
    if (parsed.tasks.includes("stale")) {
      result.stale = await runTask("stale", () => reapStale(userId));
    }
    if (parsed.tasks.includes("idle")) {
      result.idle = await runTask("idle", () => releaseIdle(userId));
    }
    if (parsed.tasks.includes("ip")) {
      result.ip = await runTask("ip", () => backfillInstanceIps(userId));
    }

    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
