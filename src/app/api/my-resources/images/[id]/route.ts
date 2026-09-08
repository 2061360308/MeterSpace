import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { userImages } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUri: z.string().min(1).optional(),
  architecture: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const image = await db.query.userImages.findFirst({
      where: and(eq(userImages.id, id), eq(userImages.userId, userId)),
    });
    if (!image) return fail({ status: 404, message: "Image not found" });
    return ok({ image });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());
    const [updated] = await db
      .update(userImages)
      .set(body)
      .where(and(eq(userImages.id, id), eq(userImages.userId, userId)))
      .returning();
    if (!updated) return fail({ status: 404, message: "Image not found" });
    return ok({ image: updated });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await db
      .delete(userImages)
      .where(and(eq(userImages.id, id), eq(userImages.userId, userId)));
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
