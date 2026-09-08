import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1).max(255),
});

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
    return ok({ keys });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const rawKey = `sk-${randomBytes(24).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 10);

    const [key] = await db
      .insert(apiKeys)
      .values({
        userId,
        name: body.name,
        keyHash,
        keyPrefix,
      })
      .returning();

    return ok({ key, rawKey }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
