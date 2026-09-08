import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { userScripts } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  script: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const script = await db.query.userScripts.findFirst({
      where: and(eq(userScripts.id, id), eq(userScripts.userId, userId)),
    });
    if (!script) return fail({ status: 404, message: "Script not found" });
    return ok({ script });
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
      .update(userScripts)
      .set(body)
      .where(and(eq(userScripts.id, id), eq(userScripts.userId, userId)))
      .returning();
    if (!updated) return fail({ status: 404, message: "Script not found" });
    return ok({ script: updated });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await db
      .delete(userScripts)
      .where(and(eq(userScripts.id, id), eq(userScripts.userId, userId)));
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
