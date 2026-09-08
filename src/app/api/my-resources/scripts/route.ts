import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { userScripts } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  script: z.string().min(1),
  sortOrder: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const scripts = await db
      .select()
      .from(userScripts)
      .where(eq(userScripts.userId, userId))
      .orderBy(userScripts.sortOrder, desc(userScripts.createdAt));
    return ok({ scripts });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const [script] = await db
      .insert(userScripts)
      .values({ ...body, userId })
      .returning();
    return ok({ script }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
