import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeAllAvailability } from "@/lib/aliyun/ecs";
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

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const availability = await describeAllAvailability(creds, region);
    const result = { availability };
    cacheSet(key, result, TTL.MINUTE * 10);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
