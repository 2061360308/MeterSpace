import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { userImages } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  imageUri: z.string().min(1),
  architecture: z.string().default("amd64"),
  source: z.enum(["marketplace", "custom"]).default("custom"),
  marketplaceId: z.string().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const images = await db
      .select()
      .from(userImages)
      .where(eq(userImages.userId, userId))
      .orderBy(desc(userImages.createdAt));
    return ok({ images });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const [image] = await db
      .insert(userImages)
      .values({ ...body, userId })
      .returning();
    return ok({ image }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
