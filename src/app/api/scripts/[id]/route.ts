import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceScripts } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const updateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  script: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    const { id: scriptId } = await params;
    const body = updateBodySchema.parse(await req.json());

    const existing = await db.query.instanceScripts.findFirst({
      where: eq(instanceScripts.id, scriptId),
    });
    if (!existing) {
      return fail({ message: "Script not found", status: 404 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.script !== undefined) patch.script = body.script;
    if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
    if (body.enabled !== undefined) patch.enabled = body.enabled;

    const [updated] = await db
      .update(instanceScripts)
      .set(patch)
      .where(eq(instanceScripts.id, scriptId))
      .returning();

    return ok({ script: updated });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    const { id: scriptId } = await params;

    const existing = await db.query.instanceScripts.findFirst({
      where: eq(instanceScripts.id, scriptId),
    });
    if (!existing) {
      return fail({ message: "Script not found", status: 404 });
    }

    await db.delete(instanceScripts).where(eq(instanceScripts.id, scriptId));

    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
