import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) return fail({ status: 404, message: "User not found" });

    const valid = await bcrypt.compare(body.oldPassword, user.password);
    if (!valid) {
      return fail({ status: 400, message: "旧密码不正确" });
    }

    const hash = await bcrypt.hash(body.newPassword, 10);
    await db.update(users).set({ password: hash }).where(eq(users.id, userId));

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}