import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { verifyAccessToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const resourceUsageSchema = z.object({
  cpu_percent: z.number(),
  memory_mb: z.number(),
  memory_total_mb: z.number(),
  disk_mb: z.number(),
  disk_total_mb: z.number(),
});

const portDeclSchema = z.object({
  port: z.number().int(),
  label: z.string().optional(),
  protocol: z.string().optional(),
  private: z.boolean().optional(),
});

const bodySchema = z.object({
  token: z.string(),
  status: z.string().optional(),
  active: z.boolean().optional(),
  uptime: z.number().optional(),
  script_status: z.string().optional(),
  script_error: z.string().optional(),
  resource_usage: resourceUsageSchema.optional(),
  access_summary: z.any().optional(),
  // === Phase C/D：模板运行时字段（FINAL-PLAN §6.1 / §9.3） ===
  current_entry: z.string().optional(),
  exposed_ports: z.array(portDeclSchema).optional(),
});

/**
 * agent 心跳（FINAL-PLAN §9.3）。
 *
 * 两个时间戳语义必须分开：
 *   - lastHeartbeatAt = 存活（liveness）—— 进程还活着，用来做超时兜底关停
 *   - lastActiveAt    = 用户活跃（activity）—— 有流量才推进，用来做空闲关停
 * 之前两者被一起无条件刷新，导致「界面开着没人用」永远不空闲。现在只刷新存活，
 * 活跃时间以 agent 侧探测结果为准（active 为 true 时推进），否则交给前端懒维护。
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyAccessToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      lastHeartbeatAt: now,
    };

    // agent 显式上报「有活跃流量」→ 推进活跃时间并清除空闲标记
    if (body.active === true) {
      updateData.lastActiveAt = now;
      updateData.idleTriggered = false;
    }

    // 当前入口（模板 entry 文件名）—— 用于前端展示与「重新执行入口」
    if (body.current_entry !== undefined) {
      updateData.currentEntry = body.current_entry;
    }

    // 运行时暴露端口（$WS_EXPOSED_PORTS_FILE 覆盖 metadata 声明）
    if (body.exposed_ports) {
      updateData.accessSummary = {
        ...(typeof body.access_summary === "object" && body.access_summary !== null
          ? body.access_summary
          : {}),
        ports: body.exposed_ports,
      };
    } else if (body.access_summary) {
      updateData.accessSummary = body.access_summary;
    }

    // 资源占用
    if (body.resource_usage) {
      updateData.cpuPercent = body.resource_usage.cpu_percent;
      updateData.memoryMb = body.resource_usage.memory_mb;
      updateData.memoryTotalMb = body.resource_usage.memory_total_mb;
      updateData.diskMb = body.resource_usage.disk_mb;
      updateData.diskTotalMb = body.resource_usage.disk_total_mb;
    }

    await db.update(instances).set(updateData).where(eq(instances.id, id));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
