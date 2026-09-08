import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const key = cacheKey("ecs:zones", region);

    const cached = cacheGet(key);
    if (cached) return ok(cached);

    await requireUserId();
    const provider = getAliyunProvider();
    const zones = await provider.getZones(region);
    const result = {
      zones: zones.map((z) => ({
        zoneId: z.id,
        localName: z.label,
      })),
    };
    cacheSet(key, result, TTL.WEEK);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
