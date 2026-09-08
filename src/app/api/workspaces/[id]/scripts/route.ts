import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceScripts } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const createBodySchema = z.object({
  name: z.string().min(1).max(100),
  script: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    const { id: workspaceId } = await params;

    const scripts = await db.query.instanceScripts.findMany({
      where: eq(instanceScripts.workspaceId, workspaceId),
      orderBy: [instanceScripts.sortOrder],
    });

    return ok({ scripts });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    const { id: workspaceId } = await params;
    const body = createBodySchema.parse(await req.json());

    const [script] = await db
      .insert(instanceScripts)
      .values({
        workspaceId,
        name: body.name,
        script: body.script,
        sortOrder: body.sortOrder,
      })
      .returning();

    return ok({ script });
  } catch (e) {
    return fail(e);
  }
}
