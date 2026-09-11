import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, instances, auditLogs } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { deleteWorkspace } from "@/lib/workspaces/service";
import { getProvider } from "@/lib/providers";
import { checkAndFixTimeouts } from "@/lib/instances/lifecycle";
import type { CloudInstance } from "@/lib/providers";
import { encrypt } from "@/lib/crypto";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  defaultDiskSize: z.number().int().min(20).optional(),
  defaultBandwidth: z.number().int().min(1).optional(),
  proxyMode: z.enum(["inherit", "disabled", "clash", "upstream"]).optional(),
  proxyClashSubscription: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => null)),
  proxyClashYaml: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => null)),
  proxyUpstreamUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => null)),
  proxyUpstreamUsername: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => null)),
  proxyUpstreamSecret: z
    .string()
    .transform((v) => (v.trim() === "" ? undefined : v))
    .optional(),
});

async function maskWorkspaceSecret<T extends Record<string, unknown>>(obj: T): Promise<T> {
  if (typeof obj.proxyUpstreamSecret === "string" && obj.proxyUpstreamSecret) {
    return { ...obj, proxyUpstreamSecret: "••••••" };
  }
  return obj;
}

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
        const provider = getProvider(workspace.provider);
        ecs = await provider?.getInstance(latestInstance.ecsInstanceId, workspace.region) ?? null;
      } catch {
        ecs = null;
      }
    }

    return ok({
      workspace: {
        ...(await maskWorkspaceSecret(workspace)),
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
    if (body.proxyMode !== undefined) patch.proxyMode = body.proxyMode;
    if (body.proxyClashSubscription !== undefined) patch.proxyClashSubscription = body.proxyClashSubscription;
    if (body.proxyClashYaml !== undefined) patch.proxyClashYaml = body.proxyClashYaml;
    if (body.proxyUpstreamUrl !== undefined) patch.proxyUpstreamUrl = body.proxyUpstreamUrl;
    if (body.proxyUpstreamUsername !== undefined) patch.proxyUpstreamUsername = body.proxyUpstreamUsername;
    if (body.proxyUpstreamSecret) {
      patch.proxyUpstreamSecret = encrypt(body.proxyUpstreamSecret);
    }

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
