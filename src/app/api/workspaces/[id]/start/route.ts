import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { startWorkspace } from "@/lib/workspaces/service";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  mode: z.enum(["quick", "custom"]).default("quick"),
  instanceType: z.string().optional(),
  spotStrategy: z
    .enum(["NoSpot", "SpotAsPriceGo", "SpotWithPriceLimit"])
    .optional(),
  spotDuration: z.number().int().optional(),
  spotPriceLimit: z.number().nullable().optional(),
  diskCategory: z.string().optional(),
  diskSize: z.number().int().optional(),
  bandwidth: z.number().int().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    const result = await startWorkspace(userId, id, body);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
