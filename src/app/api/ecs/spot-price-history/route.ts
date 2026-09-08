import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region");
    const instanceType = req.nextUrl.searchParams.get("instanceType");
    const spotDuration = Number(req.nextUrl.searchParams.get("spotDuration") ?? "0");

    if (!region || !instanceType) {
      return fail({ status: 400, message: "region and instanceType are required" });
    }

    const key = cacheKey("ecs:spot-history", region, instanceType, String(spotDuration));
    const cached = cacheGet(key);
    if (cached) return ok(cached);

    await requireUserId();
    const provider = getAliyunProvider();
    const history = await provider.getSpotPriceHistory(region, instanceType, spotDuration);
    const result = { history };
    cacheSet(key, result, TTL.DAY);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
