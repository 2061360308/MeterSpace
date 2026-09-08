import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceAccessCodes, instances, workspaces } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string; codeId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id: instanceId, codeId } = await params;

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, instanceId),
    });
    if (!instance) {
      return fail({ message: "Instance not found", status: 404 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, instance.workspaceId),
    });
    if (!workspace || workspace.userId !== userId) {
      return fail({ message: "Instance not found", status: 404 });
    }

    const code = await db.query.instanceAccessCodes.findFirst({
      where: eq(instanceAccessCodes.id, codeId),
    });
    if (!code || code.instanceId !== instanceId) {
      return fail({ message: "Code not found", status: 404 });
    }

    if (code.isPersonal) {
      return fail({ message: "Cannot revoke personal code", status: 400 });
    }

    await db
      .delete(instanceAccessCodes)
      .where(eq(instanceAccessCodes.id, codeId));

    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
