import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import {
  describeSpotAdvice,
  describePrice,
  findDebianImage,
} from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

interface PriceInfo {
  historicalDiscount: number;
  releaseRate: number;
  onDemandPrice: number;
  averageSpotPrice: number;
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceTypesStr = p.get("instanceTypes");
    if (!instanceTypesStr) return fail(new Error("instanceTypes is required"));

    const instanceTypes = instanceTypesStr.split(",").filter(Boolean);
    if (instanceTypes.length === 0) return fail(new Error("instanceTypes is empty"));
    if (instanceTypes.length > 50) return fail(new Error("instanceTypes exceeds 50 limit"));

    // Check cache for the whole batch
    const sortedTypes = [...instanceTypes].sort().join(",");
    const key = cacheKey("batch-price-info", region, sortedTypes);
    const cached = cacheGet<Record<string, PriceInfo>>(key);
    if (cached) return ok(cached);

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);

    // 1. Batch query SpotAdvice (10 at a time)
    const spotMap: Record<string, { historicalDiscount: number; releaseRate: number }> = {};
    for (let i = 0; i < instanceTypes.length; i += 10) {
      const batch = instanceTypes.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((t) => describeSpotAdvice(creds, region, t, 1))
    );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value.available) {
          spotMap[batch[idx]] = {
            historicalDiscount: r.value.historicalDiscount,
            releaseRate: r.value.releaseRate,
          };
        }
      });
    }

    // 2. Query on-demand price for each instance (concurrency 5)
    const priceMap: Record<string, number> = {};
    const imageId = await findDebianImage(creds, region);
    const concurrency = 5;
    for (let i = 0; i < instanceTypes.length; i += concurrency) {
      const batch = instanceTypes.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((t) =>
          describePrice(creds, {
            region,
            imageId,
            instanceType: t,
            spotStrategy: "NoSpot",
            spotDuration: 1,
            diskCategory: "cloud_essd",
            diskSize: 40,
            bandwidth: 10,
          })
        )
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          const instanceDetail = r.value.find(
            (d) => d.resource === "instanceType"
          );
          priceMap[batch[idx]] = instanceDetail?.originalPrice ?? 0;
        }
      });
    }

    // 3. Merge and calculate
    const result: Record<string, PriceInfo> = {};
    for (const t of instanceTypes) {
      const spot = spotMap[t] ?? { historicalDiscount: 0, releaseRate: 0 };
      const onDemandPrice = priceMap[t] ?? 0;
      result[t] = {
        ...spot,
        onDemandPrice,
        averageSpotPrice: onDemandPrice * spot.historicalDiscount,
      };
    }

    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
