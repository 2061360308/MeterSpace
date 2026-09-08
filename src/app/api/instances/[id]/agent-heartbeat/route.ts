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
        lastActiveAt: new Date(),
        idleTriggered: false,
      })
      .where(eq(instances.id, id));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
