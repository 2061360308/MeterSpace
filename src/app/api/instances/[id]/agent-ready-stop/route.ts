import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { verifyAccessToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  token: z.string(),
  ok: z.boolean(),
  oss_usage_bytes: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
});

/**
 * agent pre-stop 执行完成后的回报端点（docs/AGENT-PRESTOP.md §3）。
 *
 * 只落 ack 标记与结果字段，不推进状态（RELEASING 保持），
 * 由 `resumeReleasing` 依据 `preStopAckedAt` 收尾删 ECS。
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyAccessToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    await db
      .update(instances)
      .set({
        preStopAckedAt: new Date(),
        ...(body.ok
          ? { ossUsageBytes: body.oss_usage_bytes ?? null }
          : { bootError: body.error ?? "agent pre-stop failed" }),
        updatedAt: new Date(),
      })
      .where(eq(instances.id, id));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}