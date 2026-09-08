import { NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { cloudInstances } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  provider: z.string().default("aliyun"),
  region: z.string().min(1),
  instanceType: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");

    const conditions = [eq(cloudInstances.userId, userId)];
    if (region) {
      conditions.push(eq(cloudInstances.region, region));
    }

    const list = await db
      .select()
      .from(cloudInstances)
      .where(and(...conditions))
      .orderBy(desc(cloudInstances.createdAt));

    return ok({ instances: list });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());
    const [created] = await db
      .insert(cloudInstances)
      .values({ ...body, userId })
      .returning();
    return ok(created, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
