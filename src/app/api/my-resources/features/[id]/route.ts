import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { userFeatures } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  featureUri: z.string().min(1).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const feature = await db.query.userFeatures.findFirst({
      where: and(eq(userFeatures.id, id), eq(userFeatures.userId, userId)),
    });
    if (!feature) return fail({ status: 404, message: "Feature not found" });
    return ok({ feature });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());
    const [updated] = await db
      .update(userFeatures)
      .set(body)
      .where(and(eq(userFeatures.id, id), eq(userFeatures.userId, userId)))
      .returning();
    if (!updated) return fail({ status: 404, message: "Feature not found" });
    return ok({ feature: updated });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await db
      .delete(userFeatures)
      .where(and(eq(userFeatures.id, id), eq(userFeatures.userId, userId)));
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
