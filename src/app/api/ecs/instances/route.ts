import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region");
    if (!region) {
      return fail({ status: 400, message: "region is required" });
    }

    const key = cacheKey("ecs:instances", region);
    const cached = cacheGet(key);
    if (cached) return ok(cached);

    await requireUserId();
    const provider = getAliyunProvider();

    const [availability, allTypes] = await Promise.all([
      provider.getAvailability(region),
      provider.getInstanceTypes(region),
    ]);

    const availableIds = new Set(availability.map((a) => a.instanceTypeId));
    const types = allTypes.filter((t) => availableIds.has(t.id));

    const typeMap = new Map(types.map((t) => [t.id, t]));
    const result = {
      instances: availability.map((a) => ({
        ...a,
        spec: typeMap.get(a.instanceTypeId) ?? null,
      })),
    };

    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
