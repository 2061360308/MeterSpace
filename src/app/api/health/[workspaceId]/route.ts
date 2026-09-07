import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceStates } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { workspaceId } = await params;
    const body = (await req.json()) as {
      instanceId?: string;
      publicIp?: string;
      port?: number;
      accessToken?: string;
    };

    const state = await db.query.workspaceStates.findFirst({
      where: eq(workspaceStates.workspaceId, workspaceId),
    });
    if (!state) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    // Verify the injected access token (D5).
    if (!body.accessToken || body.accessToken !== state.accessToken) {
      return fail(Object.assign(new Error("Invalid access token"), { status: 403 }));
    }

    await db
      .update(workspaceStates)
      .set({
        status: "RUNNING",
        instanceId: body.instanceId ?? state.instanceId,
        publicIp: body.publicIp ?? null,
        port: body.port ?? 8080,
        healthCallback: true,
        idleTriggered: false,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workspaceStates.workspaceId, workspaceId));

    return ok({ status: "RUNNING" });
  } catch (e) {
    return fail(e);
  }
}
