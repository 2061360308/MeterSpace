import { NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspaceStates } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { createWorkspace } from "@/lib/workspaces/service";
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
    const list = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(desc(workspaces.createdAt));

    const ids = list.map((w) => w.id);
    const states = ids.length
      ? await db
          .select()
          .from(workspaceStates)
          .where(inArray(workspaceStates.workspaceId, ids))
      : [];
    const stateMap = new Map(states.map((s) => [s.workspaceId, s]));

    return ok({
      workspaces: list.map((w) => ({ ...w, state: stateMap.get(w.id) ?? null })),
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
