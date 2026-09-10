import { type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { instanceAccessCodes } from "@/lib/db/schema";
import { requireUserId } from "@/lib/session";
import { getInstance } from "@/lib/instances/service";
import { ok, fail } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await getInstance(userId, id);

    const personal = await db.query.instanceAccessCodes.findFirst({
      where: and(
        eq(instanceAccessCodes.instanceId, id),
        eq(instanceAccessCodes.isPersonal, true),
      ),
    });

    if (!personal) {
      return fail(new Error("实例无可用访问码"));
    }
    return ok({ url: `/access/${id}?code=${personal.code}` });
  } catch (e) {
    return fail(e);
  }
}