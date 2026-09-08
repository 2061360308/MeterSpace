import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { envVariables } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const updateSchema = z.object({
  key: z.string().min(1).max(255).optional(),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());
    const [updated] = await db
      .update(envVariables)
      .set(body)
      .where(and(eq(envVariables.id, id), eq(envVariables.userId, userId)))
      .returning();
    if (!updated) return fail({ status: 404, message: "Variable not found" });
    return ok({ variable: updated });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await db
      .delete(envVariables)
      .where(and(eq(envVariables.id, id), eq(envVariables.userId, userId)));
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
