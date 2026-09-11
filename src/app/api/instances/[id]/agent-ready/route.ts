import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, workspaces } from "@/lib/db/schema";
import { verifyAccessToken } from "@/lib/instances/auth";
import { getProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  token: z.string(),
  agentVersion: z.string().optional(),
});

/**
 * Agent 启动完成回调（FINAL-PLAN §9.3）。
 *
 * serverless 环境下没有常驻进程去轮询 ECS，公网 IP 的「主路径」就在这里：
 * 实例刚就绪 → 此刻云上必然已分配 IP → 查一次并落库。
 * agent 只需带 token 报到，不再由 agent 自行上报 publicIp（不可信且易变）。
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyAccessToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    // 取该实例行，拿到 ecsInstanceId + workspace 所属 provider/region
    const rows = await db
      .select({
        ecsInstanceId: instances.ecsInstanceId,
        provider: workspaces.provider,
        region: workspaces.region,
      })
      .from(instances)
      .innerJoin(workspaces, eq(instances.workspaceId, workspaces.id))
      .where(eq(instances.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return fail({ message: "Instance not found", status: 404 });
    }

    // 实例刚就绪，IP 必已分配 —— 这里查一次并落库（serverless 下唯一的 IP 主路径）
    let publicIp: string | null = null;
    if (row.ecsInstanceId) {
      try {
        const provider = getProvider(row.provider);
        publicIp =
          (await provider?.getInstancePublicIp(row.ecsInstanceId, row.region)) ?? null;
      } catch (e) {
        // 云 API 抖动不应阻塞 ready 状态推进：IP 留给后续 heartbeat/维护补齐
        console.warn("[agent-ready] getInstancePublicIp failed:", (e as Error).message);
      }
    }

    const now = new Date();
    await db
      .update(instances)
      .set({
        status: "RUNNING",
        ...(publicIp ? { publicIp } : {}),
        bootCompletedAt: now,
        bootPhase: null,
        lastHeartbeatAt: now,
        lastActiveAt: now,
      })
      .where(eq(instances.id, id));

    return ok({ status: "RUNNING", publicIp });
  } catch (e) {
    return fail(e);
  }
}
