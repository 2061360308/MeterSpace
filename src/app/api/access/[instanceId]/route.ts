import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceAccessCodes, instances, workspaces } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";
import {
  buildAccessSnapshot,
  extractVisitorIp,
  registerVisitorIp,
} from "@/lib/instances/access";
import { checkAndFixTimeouts } from "@/lib/instances/lifecycle";

type Params = { params: Promise<{ instanceId: string }> };

const postBodySchema = z.object({
  code: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { instanceId } = await params;
    const body = postBodySchema.parse(await req.json());

    const ip = extractVisitorIp(
      req.headers.get("x-real-ip"),
      req.headers.get("x-forwarded-for"),
      null,
    );

    const { registered } = await registerVisitorIp(
      instanceId,
      body.code,
      ip ?? "",
    );

    if (registered && ip) {
      const accessCode = await db.query.instanceAccessCodes.findFirst({
        where: eq(instanceAccessCodes.code, body.code),
      });
      if (accessCode) {
        await db
          .update(instanceAccessCodes)
          .set({ useCount: (accessCode.useCount ?? 0) + 1 })
          .where(eq(instanceAccessCodes.id, accessCode.id));
      }
    }

    return ok({ registered, ip: ip ?? null });
  } catch (e) {
    return fail(e);
  }
}

const getQuerySchema = z.object({
  code: z.string().min(1),
  since: z.string().optional(),
  cloud: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { instanceId } = await params;
    const url = new URL(req.url);
    const parsed = getQuerySchema.safeParse({
      code: url.searchParams.get("code"),
      since: url.searchParams.get("since") ?? undefined,
      cloud: url.searchParams.get("cloud") ?? undefined,
    });
    if (!parsed.success) return fail(parsed.error);

    // 触发超时检测，确保超时实例能被及时标记为 FAILED
    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, instanceId),
    });
    if (instance && ["PROVISIONING", "BOOTING"].includes(instance.status)) {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, instance.workspaceId),
      });
      if (workspace) {
        await checkAndFixTimeouts(workspace.userId, instance.workspaceId);
      }
    }

    const snapshot = await buildAccessSnapshot(
      instanceId,
      parsed.data.code,
      parsed.data.since,
      parsed.data.cloud === "1",
    );
    return ok({ snapshot });
  } catch (e) {
    return fail(e);
  }
}