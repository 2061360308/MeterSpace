import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspaceStates, auditLogs, cloudInstances } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { deleteWorkspace } from "@/lib/workspaces/service";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeInstances } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, id), eq(workspaces.userId, userId)),
    });
    if (!workspace) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    const state = await db.query.workspaceStates.findFirst({
      where: eq(workspaceStates.workspaceId, id),
    });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    // Load cloud instance
    const cloudInstance = await db.query.cloudInstances.findFirst({
      where: eq(cloudInstances.id, workspace.cloudInstanceId),
    });

    // Live ECS status (best-effort).
    let ecs: Awaited<ReturnType<typeof describeInstances>> = null;
    if (state?.instanceId) {
      try {
        const creds = await getUserCredentials(userId);
        ecs = await describeInstances(creds, workspace.region, state.instanceId);
      } catch {
        ecs = null;
      }
    }

    return ok({
      workspace: {
        ...workspace,
        cloudInstanceName: cloudInstance?.name ?? null,
        cloudInstanceType: cloudInstance?.instanceType ?? null,
        state,
        logs,
        ecs,
      },
    });
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
