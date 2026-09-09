import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/session";
import { getInstance } from "@/lib/instances/service";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string; instanceId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, instanceId } = await params;

    const instance = await getInstance(userId, instanceId);
    if (instance.workspaceId !== id) {
      return fail({ message: "Not found", status: 404 });
    }

    if (!instance.ecsInstanceId) {
      return ok({ status: instance.status, cloudStatus: null });
    }

    if (!["BOOTING", "PROVISIONING"].includes(instance.status)) {
      return ok({ status: instance.status, cloudStatus: null });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, id), eq(workspaces.userId, userId)),
    });
    if (!workspace) {
      return fail({ message: "Workspace not found", status: 404 });
    }

    const provider = getProvider(workspace.provider);
    if (!provider) {
      return ok({ status: instance.status, cloudStatus: null });
    }

    const cloudStatus = await provider.getInstanceCloudStatus(
      instance.ecsInstanceId,
      workspace.region,
    );

    return ok({ status: instance.status, cloudStatus });
  } catch (e) {
    return fail(e);
  }
}
