import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { gitTokens } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const userId = await requireUserId();
    const rows = await db
      .select({
        provider: gitTokens.provider,
        username: gitTokens.username,
        updatedAt: gitTokens.updatedAt,
      })
      .from(gitTokens)
      .where(eq(gitTokens.userId, userId));
    return ok({ tokens: rows });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const provider = req.nextUrl.searchParams.get("provider") ?? "github";
    await db
      .delete(gitTokens)
      .where(and(eq(gitTokens.userId, userId), eq(gitTokens.provider, provider)));
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}