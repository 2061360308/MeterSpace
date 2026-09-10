import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, instances, auditLogs } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { deleteWorkspace } from "@/lib/workspaces/service";
import { getAliyunProvider } from "@/lib/providers";
import { checkAndFixTimeouts } from "@/lib/instances/lifecycle";
import type { CloudInstance } from "@/lib/providers";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  defaultDiskSize: z.number().int().min(20).optional(),
  defaultBandwidth: z.number().int().min(1).optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, id), eq(workspaces.userId, userId)),
    });
    if (!workspace) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    // 修正超时实例后再读取工作区状态，确保状态展示准确
    await checkAndFixTimeouts(userId, id);

    // 查询最新实例获取状态
    const latestInstance = await db.query.instances.findFirst({
      where: eq(instances.workspaceId, id),
      orderBy: desc(instances.createdAt),
    });

    const state = latestInstance
      ? {
          status: latestInstance.status,
          instanceId: latestInstance.ecsInstanceId,
          publicIp: latestInstance.publicIp,
          port: latestInstance.port,
          lastActiveAt: latestInstance.lastActiveAt,
          ossUsageBytes: latestInstance.ossUsageBytes,
          releasedAt: latestInstance.stoppedAt,
        }
      : null;

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    let ecs: CloudInstance | null = null;
    if (latestInstance?.ecsInstanceId) {
      try {
        const provider = getAliyunProvider();
        ecs = await provider.getInstance(latestInstance.ecsInstanceId);
      } catch {
        ecs = null;
      }
    }

    return ok({
      workspace: {
        ...workspace,
        state,
        logs,
        ecs,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, id), eq(workspaces.userId, userId)),
    });
    if (!workspace) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    const patch: Partial<typeof workspaces.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.defaultDiskSize !== undefined) patch.defaultDiskSize = body.defaultDiskSize;
    if (body.defaultBandwidth !== undefined) patch.defaultBandwidth = body.defaultBandwidth;

    await db.update(workspaces).set(patch).where(eq(workspaces.id, id));

    await db.insert(auditLogs).values({
      userId,
      workspaceId: id,
      action: "UPDATE",
      details: body,
    });

    return ok({ success: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const result = await deleteWorkspace(userId, id);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
