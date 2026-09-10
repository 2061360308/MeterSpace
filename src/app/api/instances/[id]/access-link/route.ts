import { type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceAccessCodes, instances, workspaces } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { InstanceError } from "@/lib/instances/service";
import { ok, fail } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, id),
    });
    if (!instance) throw new InstanceError("Instance not found", 404);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, instance.workspaceId),
    });
    if (!workspace || workspace.userId !== userId) {
      throw new InstanceError("Instance not found", 404);
    }

    const personal = await db.query.instanceAccessCodes.findFirst({
      where: and(
        eq(instanceAccessCodes.instanceId, id),
        eq(instanceAccessCodes.isPersonal, true),
      ),
    });

    if (!personal) {
      return fail(new Error("实例无可用访问码"));
    }
    return ok({ url: `/access/${id}?code=${personal.code}` });
  } catch (e) {
    return fail(e);
  }
}