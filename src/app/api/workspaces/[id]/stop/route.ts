import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { stopWorkspace } from "@/lib/workspaces/service";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const result = await stopWorkspace(userId, id);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
