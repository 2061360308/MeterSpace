import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeSpotAdvice } from "@/lib/aliyun/ecs";
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

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const advice = await describeSpotAdvice(creds, region, instanceType, spotDuration);
    cacheSet(key, advice, TTL.MINUTE * 30);
    return ok(advice);
  } catch (e) {
    return fail(e);
  }
}
