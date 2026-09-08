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
  phase: z.string(),
  message: z.string().optional(),
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
      .set({ bootPhase: body.phase })
      .where(eq(instances.id, id));

    if (body.message) {
      await db.insert(instanceLogs).values({
        instanceId: id,
        timestamp: new Date(),
        level: "info",
        phase: body.phase,
        message: body.message,
      });
    }

    return ok({ phase: body.phase });
  } catch (e) {
    return fail(e);
  }
}
