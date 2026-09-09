import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
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

    // 查找该工作区最新的实例
    const instance = await db.query.instances.findFirst({
      where: eq(instances.workspaceId, workspaceId),
      orderBy: desc(instances.createdAt),
    });
    if (!instance) return fail(Object.assign(new Error("Not found"), { status: 404 }));

    // 验证 accessToken
    if (!body.accessToken || body.accessToken !== instance.accessToken) {
      return fail(Object.assign(new Error("Invalid access token"), { status: 403 }));
    }

    // 更新实例状态为 RUNNING
    await db
      .update(instances)
      .set({
        status: "RUNNING",
        publicIp: body.publicIp ?? null,
        port: body.port ?? 8080,
        bootCompletedAt: new Date(),
        bootPhase: null,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(instances.id, instance.id));

    return ok({ status: "RUNNING" });
  } catch (e) {
    return fail(e);
  }
}
