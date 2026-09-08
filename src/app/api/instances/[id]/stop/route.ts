import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { stopInstance } from "@/lib/instances/service";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const result = await stopInstance(userId, id);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
