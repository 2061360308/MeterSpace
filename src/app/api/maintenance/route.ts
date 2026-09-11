import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import {
  checkAndFixTimeouts,
  reapStale,
  releaseIdle,
  backfillInstanceIps,
} from "@/lib/instances/lifecycle";
import { ok, fail } from "@/lib/api";

/**
 * 懒处理入口：由前端在打开页面 / 定时轮询时调用。
 *
 * serverless 无后台进程，所有时序逻辑都靠请求触发（见 docs/FINAL-PLAN.md 第 10 章）。
 */

const bodySchema = z.object({
  /** 要执行的检查项，缺省全跑 */
  tasks: z
    .array(z.enum(["timeout", "idle", "stale", "ip"]))
    .default(["timeout", "idle", "stale", "ip"]),
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

    let parsed: { tasks: ("timeout" | "idle" | "stale" | "ip")[] } = {
      tasks: ["timeout", "idle", "stale", "ip"],
    };
    try {
      parsed = bodySchema.parse(await req.json());
    } catch {
      // 无 body 时按全量处理
    }

    const result: Record<string, unknown> = {};

    if (parsed.tasks.includes("timeout")) {
      result.timeout = await runTask("timeout", () => checkAndFixTimeouts(userId));
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
