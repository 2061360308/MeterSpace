import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { userFeatures } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  featureUri: z.string().min(1),
  options: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(["marketplace", "custom"]).default("custom"),
  marketplaceId: z.string().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const features = await db
      .select()
      .from(userFeatures)
      .where(eq(userFeatures.userId, userId))
      .orderBy(desc(userFeatures.createdAt));
    return ok({ features });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const [feature] = await db
      .insert(userFeatures)
      .values({ ...body, userId })
      .returning();
    return ok({ feature }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
