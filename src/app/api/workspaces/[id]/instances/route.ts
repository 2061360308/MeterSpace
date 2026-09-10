import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { createInstance, listInstances } from "@/lib/instances/service";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const createBodySchema = z.object({
  cloudInstanceId: z.string().uuid(),
  diskSize: z.number().int().min(20).max(2048).optional(),
  bandwidth: z.number().int().min(1).max(200).optional(),
  spotStrategy: z
    .enum(["NoSpot", "SpotAsPriceGo", "SpotWithPriceLimit"])
    .default("NoSpot"),
  spotDuration: z.number().int().min(0).max(1).default(1),
  spotPriceLimit: z.number().min(0).nullable().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const instances = await listInstances(userId, id);
    return ok({ instances });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = createBodySchema.parse(await req.json());
    const result = await createInstance(userId, id, body);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
