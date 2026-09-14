import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, instanceLogs, workspaces } from "@/lib/db/schema";
import { verifyAccessToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";
import { getProvider } from "@/lib/providers";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  token: z.string(),
  error: z.string(),
  // phase 枚举（docs/AGENT-LIFECYCLE.md §11.2）：entry / timeout / payload / runtime。
  // 后端的 FAILED→立即销毁路径对所有 phase 一视同仁。
  phase: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyAccessToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, id),
    });
    const workspace = instance
      ? await db.query.workspaces.findFirst({
          where: eq(workspaces.id, instance.workspaceId),
        })
      : null;

    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: body.error,
        bootPhase: body.phase ?? null,
        updatedAt: new Date(),
      })
      .where(eq(instances.id, id));

    await db.insert(instanceLogs).values({
      instanceId: id,
      timestamp: new Date(),
      level: "error",
      phase: body.phase ?? null,
      message: body.error,
    });

    if (instance?.ecsInstanceId && workspace) {
      try {
        const provider = getProvider(workspace.provider);
        await provider?.deleteInstance(instance.ecsInstanceId, workspace.region);
        await db
          .update(instances)
          .set({
            status: "STOPPED",
            autoReleaseAt: null,
            stoppedAt: new Date(),
            stopReason: "boot_failed",
            updatedAt: new Date(),
          })
          .where(eq(instances.id, id));
      } catch (deleteErr) {
        console.error("[agent-error] Failed to delete ECS instance:", deleteErr);
      }
    }

    return ok({ status: "FAILED" });
  } catch (e) {
    return fail(e);
  }
}
