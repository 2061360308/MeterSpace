import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceAccessCodes, instances, workspaces } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const createBodySchema = z.object({
  label: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().min(1).optional(),
  allowedPorts: z.array(z.number().int()).min(1).default([8080]),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id: instanceId } = await params;

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, instanceId),
    });
    if (!instance) {
      return fail({ message: "Instance not found", status: 404 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, instance.workspaceId),
    });
    if (!workspace || workspace.userId !== userId) {
      return fail({ message: "Instance not found", status: 404 });
    }

    const codes = await db.query.instanceAccessCodes.findMany({
      where: eq(instanceAccessCodes.instanceId, instanceId),
    });

    return ok({ codes });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id: instanceId } = await params;
    const body = createBodySchema.parse(await req.json());

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, instanceId),
    });
    if (!instance) {
      return fail({ message: "Instance not found", status: 404 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, instance.workspaceId),
    });
    if (!workspace || workspace.userId !== userId) {
      return fail({ message: "Instance not found", status: 404 });
    }

    const code = `inv_${generateCode()}`;

    const [accessCode] = await db
      .insert(instanceAccessCodes)
      .values({
        instanceId,
        code,
        isPersonal: false,
        allowedPorts: body.allowedPorts,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxUses: body.maxUses ?? null,
        label: body.label ?? null,
      })
      .returning();

    return ok({
      code: accessCode,
      link: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/instances/${instanceId}?code=${code}`,
    });
  } catch (e) {
    return fail(e);
  }
}

function generateCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
