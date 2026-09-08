import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instances } from "@/lib/db/schema";
import { verifyBootToken } from "@/lib/instances/auth";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  token: z.string(),
  publicIp: z.string(),
  port: z.number().int().default(8080),
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
        status: "RUNNING",
        publicIp: body.publicIp,
        port: body.port,
        bootCompletedAt: new Date(),
        bootPhase: null,
        bootToken: null,
        lastActiveAt: new Date(),
      })
      .where(eq(instances.id, id));

    return ok({ status: "RUNNING" });
  } catch (e) {
    return fail(e);
  }
}
