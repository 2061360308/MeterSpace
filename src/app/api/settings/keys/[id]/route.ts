import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
