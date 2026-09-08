import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances, instanceLogs } from "@/lib/db/schema";
import { verifyBootToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  token: z.string(),
  error: z.string(),
  phase: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await req.json());

    const valid = await verifyBootToken(id, body.token);
    if (!valid) {
      return fail({ message: "Invalid token", status: 401 });
    }

    await db
      .update(instances)
      .set({
        status: "FAILED",
        bootError: body.error,
        bootPhase: body.phase ?? null,
        updatedAt: new Date(),
      })
      .where(eq(instances.id, id));

    await db.insert(instanceLogs).values({
      instanceId: id,
      timestamp: new Date(),
      level: "error",
      phase: body.phase ?? null,
      message: body.error,
    });

    return ok({ status: "FAILED" });
  } catch (e) {
    return fail(e);
  }
}
