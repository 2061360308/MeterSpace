import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, instances } from "@/lib/db/schema";
import { stopWorkspace } from "@/lib/workspaces/service";

/**
 * Cron 兜底：释放已触发空闲的工作区（RUNNING 且 idle_triggered）。
 * 由 Vercel Cron 定时调用，须携带 CRON_SECRET 鉴权。
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      userId: workspaces.userId,
      workspaceId: instances.workspaceId,
    })
    .from(instances)
    .innerJoin(workspaces, eq(workspaces.id, instances.workspaceId))
    .where(
      and(
        eq(instances.status, "RUNNING"),
        eq(instances.idleTriggered, true),
      ),
    );

  const released: string[] = [];
  const failed: { workspaceId: string; error: string }[] = [];

  for (const row of rows) {
    try {
      await stopWorkspace(row.userId, row.workspaceId);
      released.push(row.workspaceId);
    } catch (e) {
      failed.push({
        workspaceId: row.workspaceId,
        error: (e as Error).message,
      });
    }
  }

  return NextResponse.json({ released, failed });
}
