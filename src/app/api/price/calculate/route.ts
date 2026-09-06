import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { findUbuntu2204Image } from "@/lib/aliyun/ecs";
import { calculatePrice } from "@/lib/price/calculator";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  region: z.string().default("cn-hangzhou"),
  instanceType: z.string().min(1),
  spotStrategy: z.enum(["NoSpot", "SpotAsPriceGo", "SpotWithPriceLimit"]).default("NoSpot"),
  spotDuration: z.number().int().default(1),
  spotPriceLimit: z.number().nullable().optional(),
  diskCategory: z.string().default("cloud_essd"),
  diskSize: z.number().int().default(40),
  bandwidth: z.number().int().default(10),
  durationHours: z.number().int().default(4),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = bodySchema.parse(await req.json());

    const creds = await getUserCredentials(userId);
    const imageId = await findUbuntu2204Image(creds, body.region);
    const result = await calculatePrice(creds, {
      region: body.region,
      imageId,
      instanceType: body.instanceType,
      spotStrategy: body.spotStrategy,
      spotDuration: body.spotDuration,
      spotPriceLimit: body.spotPriceLimit ?? null,
      diskCategory: body.diskCategory,
      diskSize: body.diskSize,
      bandwidth: body.bandwidth,
      durationHours: body.durationHours,
    });
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
