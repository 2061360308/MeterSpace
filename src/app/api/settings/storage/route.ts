import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { storageVolumes } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  mountPath: z.string().min(1),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const volumes = await db
      .select()
      .from(storageVolumes)
      .where(eq(storageVolumes.userId, userId))
      .orderBy(desc(storageVolumes.createdAt));
    return ok({ volumes });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const [volume] = await db
      .insert(storageVolumes)
      .values({ ...body, userId })
      .returning();
    return ok({ volume }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
