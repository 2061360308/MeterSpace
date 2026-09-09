import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getInstance } from "@/lib/instances/service";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const instance = await getInstance(userId, id);
    return ok({ instance });
  } catch (e) {
    return fail(e);
  }
}
