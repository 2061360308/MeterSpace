import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { envVariables } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const createSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string().min(1),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const vars = await db
      .select()
      .from(envVariables)
      .where(eq(envVariables.userId, userId))
      .orderBy(desc(envVariables.createdAt));
    return ok({ variables: vars });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const [variable] = await db
      .insert(envVariables)
      .values({ ...body, userId })
      .returning();
    return ok({ variable }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
