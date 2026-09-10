import { NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, instances } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { createWorkspace } from "@/lib/workspaces/service";
import { checkAndFixTimeouts } from "@/lib/instances/lifecycle";
import { ok, fail } from "@/lib/api";

const featureSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  uri: z.string().optional(),
});

const scriptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  script: z.string().min(1),
});

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.string().default("aliyun"),
  region: z.string().min(1),
  cloudInstanceId: z.string().uuid().optional(),
  diskCategory: z.string().default("cloud_essd"),
  diskSize: z.number().int().min(20).default(40),
  bandwidth: z.number().int().min(1).default(10),
  publicIp: z.boolean().default(true),
  imageUri: z.string().min(1),
  features: z.array(featureSchema).default([]),
  scripts: z.array(scriptSchema).default([]),
  gitProvider: z.string().nullable().optional(),
  gitRepoUrl: z.string().nullable().optional(),
  gitBranch: z.string().default("main"),
  autoClone: z.boolean().default(true),
  releaseHours: z.number().int().nullable().optional(),
  idleMinutes: z.number().int().nullable().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();

    // 修正超时实例后再读取工作区状态，确保状态展示准确
    await checkAndFixTimeouts(userId);

    const list = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(desc(workspaces.createdAt));

    const ids = list.map((w) => w.id);
    if (ids.length === 0) {
      return ok({ workspaces: [] });
    }

    // 查询每个工作区的最新实例
    const latestInstances = await db
      .select({
        workspaceId: instances.workspaceId,
        id: instances.id,
        status: instances.status,
        publicIp: instances.publicIp,
        port: instances.port,
        lastActiveAt: instances.lastActiveAt,
        ossUsageBytes: instances.ossUsageBytes,
        stoppedAt: instances.stoppedAt,
        createdAt: instances.createdAt,
      })
      .from(instances)
      .where(inArray(instances.workspaceId, ids))
      .orderBy(desc(instances.createdAt));

    // 按 workspaceId 分组，取最新的实例
    const instanceMap = new Map<string, typeof latestInstances[0]>();
    for (const inst of latestInstances) {
      if (!instanceMap.has(inst.workspaceId)) {
        instanceMap.set(inst.workspaceId, inst);
      }
    }

    return ok({
      workspaces: list.map((w) => {
        const inst = instanceMap.get(w.id);
        return {
          ...w,
          state: inst
            ? {
                instanceId: inst.id,
                status: inst.status,
                publicIp: inst.publicIp,
                port: inst.port,
                lastActiveAt: inst.lastActiveAt,
                ossUsageBytes: inst.ossUsageBytes,
                releasedAt: inst.stoppedAt,
              }
            : null,
        };
      }),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());
    const result = await createWorkspace(userId, body);
    return ok(result, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
