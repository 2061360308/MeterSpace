import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { renewWorkspace } from "@/lib/workspaces/service";
import { ok, fail } from "@/lib/api";

type Params = { params: { id: string } };

const bodySchema = z.object({
  hours: z.number().int().min(1).default(1),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());
    const result = await renewWorkspace(userId, params.id, body.hours);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
