import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceAccessCodes, instances } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  code: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());

    const accessCode = await db.query.instanceAccessCodes.findFirst({
      where: eq(instanceAccessCodes.code, body.code),
    });
    if (!accessCode) {
      return fail({ message: "Invalid code", status: 404 });
    }

    if (accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
      return fail({ message: "Code has expired", status: 410 });
    }

    if (accessCode.maxUses && (accessCode.useCount ?? 0) >= accessCode.maxUses) {
      return fail({ message: "Code has reached maximum uses", status: 403 });
    }

    const instance = await db.query.instances.findFirst({
      where: eq(instances.id, accessCode.instanceId),
    });
    if (!instance) {
      return fail({ message: "Instance not found", status: 404 });
    }

    if (instance.status !== "RUNNING") {
      return fail({ message: "Instance is not running", status: 503 });
    }

    await db
      .update(instanceAccessCodes)
      .set({ useCount: (accessCode.useCount ?? 0) + 1 })
      .where(eq(instanceAccessCodes.id, accessCode.id));

    return ok({
      instanceId: instance.id,
      publicIp: instance.publicIp,
      port: instance.port,
      allowedPorts: accessCode.allowedPorts,
    });
  } catch (e) {
    return fail(e);
  }
}
