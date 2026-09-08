import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getAliyunProvider } from "@/lib/providers";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const region = p.get("region") ?? "cn-hangzhou";
    const instanceType = p.get("instanceType");
    if (!instanceType) return fail(new Error("instanceType is required"));
    const spotDuration = Number(p.get("spotDuration") ?? 1);

    const key = cacheKey("ecs:spot-advice", region, instanceType, spotDuration);
    const cached = cacheGet(key);
    if (cached) return ok(cached);

    await requireUserId();
    const provider = getAliyunProvider();
    const advice = await provider.getSpotAdvice(region, instanceType, spotDuration);
    cacheSet(key, advice, TTL.MINUTE * 30);
    return ok(advice);
  } catch (e) {
    return fail(e);
  }
}
