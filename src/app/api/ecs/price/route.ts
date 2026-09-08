import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceType = p.get("instanceType");
    if (!instanceType) return fail(new Error("instanceType is required"));

    const spotStrategy = p.get("spotStrategy") ?? "NoSpot";
    const spotDuration = Number(p.get("spotDuration") ?? 1);
    const diskCategory = p.get("diskCategory") ?? "cloud_essd";
    const diskSize = Number(p.get("diskSize") ?? 40);
    const bandwidth = Number(p.get("bandwidth") ?? 10);

    const key = cacheKey(
      "ecs:price",
      userId,
      region,
      instanceType,
      spotStrategy,
      spotDuration,
      diskCategory,
      diskSize,
      bandwidth
    );
    const cached = cacheGet(key);
    if (cached) return ok(cached);

    const provider = getAliyunProvider();
    const imageId = await provider.findImage(region, "debian", "12");
    const details = await provider.describePrice({
      region,
      imageId,
      instanceType,
      spotStrategy,
      spotDuration,
      diskCategory,
      diskSize,
      bandwidth,
    });
    const result = { details };
    cacheSet(key, result, TTL.HOUR);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
