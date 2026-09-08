import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const key = cacheKey("ecs:availability", region);

    if (!refresh) {
      const cached = cacheGet(key);
      if (cached) return ok(cached);
    }

    await requireUserId();
    const provider = getAliyunProvider();
    const availability = await provider.getAvailability(region);
    const result = { availability };
    cacheSet(key, result, TTL.MINUTE * 10);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
