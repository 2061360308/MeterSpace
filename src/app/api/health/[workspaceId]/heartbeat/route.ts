import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceStates } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: { workspaceId: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    await db
      .update(workspaceStates)
      .set({ lastActiveAt: new Date(), idleTriggered: false, updatedAt: new Date() })
      .where(eq(workspaceStates.workspaceId, params.workspaceId));
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
