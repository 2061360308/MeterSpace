import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getUserCredentials } from "@/lib/aliyun/auth";
import { describeZones } from "@/lib/aliyun/ecs";
import { ok, fail } from "@/lib/api";
import { cacheGet, cacheSet, cacheKey, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const region = req.nextUrl.searchParams.get("region") ?? "cn-hangzhou";
    const key = cacheKey("ecs:zones", region);

    const cached = cacheGet(key);
    if (cached) return ok(cached);

    const userId = await requireUserId();
    const creds = await getUserCredentials(userId);
    const zones = await describeZones(creds, region);
    const result = {
      zones: zones.map((z) => ({
        zoneId: z.zoneId,
        localName: z.localName,
      })),
    };
    cacheSet(key, result, TTL.WEEK);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
