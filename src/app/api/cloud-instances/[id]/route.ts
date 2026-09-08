import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { cloudInstances } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const [instance] = await db
      .select()
      .from(cloudInstances)
      .where(and(eq(cloudInstances.id, id), eq(cloudInstances.userId, userId)));

    if (!instance) {
      return ok({ error: "Not found" }, { status: 404 });
    }
    return ok(instance);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const [deleted] = await db
      .delete(cloudInstances)
      .where(and(eq(cloudInstances.id, id), eq(cloudInstances.userId, userId)))
      .returning();

    if (!deleted) {
      return ok({ error: "Not found" }, { status: 404 });
    }
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
