import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ workspaceId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    const { workspaceId } = await params;
    
    // 查找该工作区最新的实例
    const instance = await db.query.instances.findFirst({
      where: eq(instances.workspaceId, workspaceId),
      orderBy: desc(instances.createdAt),
    });
    
    if (instance) {
      await db
        .update(instances)
        .set({ lastActiveAt: new Date(), idleTriggered: false, updatedAt: new Date() })
        .where(eq(instances.id, instance.id));
    }
    
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
