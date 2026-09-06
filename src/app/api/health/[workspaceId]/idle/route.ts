import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceStates } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

type Params = { params: { workspaceId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { workspaceId } = params;
    const body = (await req.json()) as {
      idleSeconds?: number;
      accessToken?: string;
    };

    const state = await db.query.workspaceStates.findFirst({
      where: eq(workspaceStates.workspaceId, workspaceId),
    });
    if (!state) return fail(Object.assign(new Error("Not found"), { status: 404 }));
    if (!body.accessToken || body.accessToken !== state.accessToken) {
      return fail(Object.assign(new Error("Invalid access token"), { status: 403 }));
    }

    await db
      .update(workspaceStates)
      .set({ idleTriggered: true, updatedAt: new Date() })
      .where(eq(workspaceStates.workspaceId, workspaceId));

    // NOTE: actual release is triggered by the caller (stop flow) or a Vercel cron.
    return ok({ idleTriggered: true, idleSeconds: body.idleSeconds });
  } catch (e) {
    return fail(e);
  }
}
